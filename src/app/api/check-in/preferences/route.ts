import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { parseGuestSession, verifyGuestSessionAccess } from '@/lib/guestSession';
import { isAdminRequest } from '@/lib/rbac';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

const preferencesSchema = z.object({
  checkInTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-in time must be in HH:MM format'),
  checkOutTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-out time must be in HH:MM format'),
});

const PREFERENCES_KEY = 'checkin_preferences';

interface CheckInPreferences {
  checkInTime: string;
  checkOutTime: string;
  updatedAt: number;
}

function defaultPreferences(): CheckInPreferences {
  return { checkInTime: '15:00', checkOutTime: '11:00', updatedAt: 0 };
}

async function readPreferences(): Promise<CheckInPreferences> {
  const { prisma } = await import('@/lib/prisma');
  const row = await prisma.operationalSetting.findUnique({ where: { key: PREFERENCES_KEY } });
  const parsed = preferencesSchema.safeParse(row?.value);
  if (!parsed.success) return defaultPreferences();
  const value = row?.value as Record<string, unknown>;
  return {
    ...parsed.data,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : row?.updatedAt.getTime() ?? 0,
  };
}

async function writePreferences(prefs: CheckInPreferences): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  const value = {
    checkInTime: prefs.checkInTime,
    checkOutTime: prefs.checkOutTime,
    updatedAt: prefs.updatedAt,
  };
  await prisma.operationalSetting.upsert({
    where: { key: PREFERENCES_KEY },
    create: { key: PREFERENCES_KEY, value },
    update: { value },
  });
}

export const dynamic = 'force-dynamic';

// GET: Retrieve current preferences
export const GET = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const adminAccess = await isAdminRequest(request);
  const guestSession = parseGuestSession(request.cookies.get('guest_session')?.value);
  const guestAccess = await verifyGuestSessionAccess(guestSession);
  if (!adminAccess && !guestAccess) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Authentication required to view preferences');
  }

  const prefs = await readPreferences();
  let wifi: { network: string; password: string } | null = null;
  let wifiAvailableAt: string | null = null;
  if (adminAccess) {
    wifi = {
      network: process.env.GUEST_WIFI_NETWORK || '',
      password: process.env.GUEST_WIFI_PASSWORD || '',
    };
  } else if (guestAccess?.booking?.id) {
    const { prisma } = await import('@/lib/prisma');
    const booking = await prisma.booking.findUnique({
      where: { id: guestAccess.booking.id },
      select: { startDate: true, endDate: true },
    });
    if (booking) {
      const revealAt = new Date(booking.startDate);
      revealAt.setUTCHours(revealAt.getUTCHours() - 24);
      wifiAvailableAt = revealAt.toISOString();
      const now = new Date();
      if (now >= revealAt && now <= booking.endDate) {
        wifi = {
          network: process.env.GUEST_WIFI_NETWORK || '',
          password: process.env.GUEST_WIFI_PASSWORD || '',
        };
      }
    }
  }
  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({
    ...prefs,
    canEdit: adminAccess,
    wifi,
    wifiAvailableAt,
  }, undefined, correlationId);
});

// POST: Update preferences (admin-only)
export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  // Basic security checks only (content type, XSS/SQLi)
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required to update preferences');
  }

  const parseBody = validateRequestBody(preferencesSchema);
  const body = await parseBody(request);

  const prefs: CheckInPreferences = {
    checkInTime: body.checkInTime,
    checkOutTime: body.checkOutTime,
    updatedAt: Date.now(),
  };

  await writePreferences(prefs);

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;

  return createSuccessResponse({
    message: 'Check-in preferences updated successfully',
    preferences: prefs,
  }, undefined, correlationId);
});
