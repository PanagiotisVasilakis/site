import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import type { CheckInRequest, CheckInRequestStatus } from '@prisma/client';
import crypto from 'node:crypto';

export type CheckInRequestRecord = {
  id: string;
  booking_id?: string;
  user_id?: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  requested_time: string;
  message?: string;
  status: CheckInRequestStatus;
  created_at: number;
  updated_at: number;
};

type CreateCheckInRequestInput = {
  bookingId?: string;
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  requestedTime: string;
  message?: string;
};

function mapRequest(request: CheckInRequest): CheckInRequestRecord {
  return {
    id: request.id,
    booking_id: request.bookingId ?? undefined,
    user_id: request.userId ?? undefined,
    guest_name: request.guestName ?? undefined,
    guest_email: request.guestEmail ?? undefined,
    guest_phone: request.guestPhone ?? undefined,
    requested_time: request.requestedTime,
    message: request.message ?? undefined,
    status: request.status,
    created_at: request.createdAt.getTime(),
    updated_at: request.updatedAt.getTime(),
  };
}

async function create(input: CreateCheckInRequestInput): Promise<CheckInRequestRecord> {
  try {
    const request = await prisma.checkInRequest.create({
      data: {
        id: crypto.randomUUID(),
        bookingId: input.bookingId ?? null,
        userId: input.userId ?? null,
        guestName: input.guestName ?? null,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        requestedTime: input.requestedTime,
        message: input.message ?? null,
      },
    });

    logger.info('Check-in request created', {
      requestId: request.id,
      bookingId: input.bookingId,
      userId: input.userId,
    });
    return mapRequest(request);
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): create failed', error);
    throw error;
  }
}

async function findLatestForGuest(params: { bookingId?: string; userId?: string }): Promise<CheckInRequestRecord | undefined> {
  try {
    if (!params.bookingId && !params.userId) return undefined;

    const request = await prisma.checkInRequest.findFirst({
      where: {
        OR: [
          ...(params.bookingId ? [{ bookingId: params.bookingId }] : []),
          ...(params.userId ? [{ userId: params.userId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return request ? mapRequest(request) : undefined;
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): findLatestForGuest failed', error);
    throw error;
  }
}

async function getAll(): Promise<CheckInRequestRecord[]> {
  try {
    const requests = await prisma.checkInRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return requests.map(mapRequest);
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const checkInRequestRepository = {
  create,
  findLatestForGuest,
  getAll,
};
