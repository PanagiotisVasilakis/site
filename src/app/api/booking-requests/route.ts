import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/net/getClientIp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { deliverOutboxEvent } from '@/lib/bookingOutbox';
import { ApiError, readJsonBody } from '@/lib/apiErrorHandler';
import { normalizeStayRequestPhone } from '@/lib/stayRequestPhone';

export const dynamic = 'force-dynamic';

const bookingRequestSchema = z.object({
  propertyName: z.string().trim().min(1).max(200),
  locale: z.string().trim().max(8).refine((value) => {
    const [language, region, extra] = value.split('-');
    return !extra
      && language.length === 2
      && [...language].every((character) => character >= 'a' && character <= 'z')
      && (!region || (region.length === 2 && [...region].every((character) => character >= 'A' && character <= 'Z')));
  }, 'Invalid locale'),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  guest: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(7).max(32).refine(
      (value) => /^\+?[0-9 ()-]{7,32}$/.test(value),
      'Invalid phone number',
    ),
    arrivalTime: z.string().trim().max(40).optional(),
    specialRequests: z.string().trim().max(1000).optional(),
  }),
}).superRefine((value, context) => {
  const from = new Date(value.dateRange.from);
  const to = new Date(value.dateRange.to);
  if (to <= from) {
    context.addIssue({ code: 'custom', path: ['dateRange', 'to'], message: 'End date must be after start date' });
  }
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}

function idempotencyKey(request: NextRequest): string | null {
  const key = request.headers.get('idempotency-key')?.trim();
  return key && /^[A-Za-z0-9._:-]{16,128}$/.test(key) ? key : null;
}

export async function POST(request: NextRequest) {
  if (!process.env.BOOKING_REQUEST_WEBHOOK_URL) {
    return errorResponse('Booking requests are temporarily unavailable', 503);
  }
  const key = idempotencyKey(request);
  if (!key) return errorResponse('A valid Idempotency-Key header is required', 400);

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 32 * 1_024);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message, error.statusCode);
    throw error;
  }
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('Invalid booking request payload', 422);
  const phone = normalizeStayRequestPhone(parsed.data.guest.phone);
  if (!phone) return errorResponse('Invalid phone number', 422);

  const clientIp = getClientIp(request);
  const limit = await checkSensitiveRateLimit(request, {
    scope: 'booking-request',
    identifier: `${clientIp}:${parsed.data.guest.email}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return errorResponse('Too many booking requests. Please try again later.', 429);

  const existing = await prisma.stayRequest.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    return NextResponse.json({ success: true, data: { id: existing.id, status: existing.status.toLowerCase() } }, { status: 200 });
  }

  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  try {
    await prisma.stayRequest.create({
      data: {
        id,
        propertyName: parsed.data.propertyName,
        locale: parsed.data.locale,
        startDate: new Date(parsed.data.dateRange.from),
        endDate: new Date(parsed.data.dateRange.to),
        firstName: parsed.data.guest.firstName,
        lastName: parsed.data.guest.lastName,
        email: parsed.data.guest.email,
        phone,
        arrivalTime: parsed.data.guest.arrivalTime || null,
        specialRequests: parsed.data.guest.specialRequests || null,
        idempotencyKey: key,
        outboxEvents: {
          create: {
            id: eventId,
            eventType: 'booking_request.created',
            destination: 'booking_request_webhook',
            aggregateType: 'stay_request',
            aggregateId: id,
            idempotencyKey: `booking-request:${key}`,
            payload: { stayRequestId: id },
          },
        },
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const raced = await prisma.stayRequest.findUnique({ where: { idempotencyKey: key } });
      if (raced) {
        return NextResponse.json({ success: true, data: { id: raced.id, status: raced.status.toLowerCase() } }, { status: 200 });
      }
    }
    throw error;
  }

  await deliverOutboxEvent(eventId);
  return NextResponse.json({ success: true, data: { id, status: 'queued' } }, { status: 202 });
}
