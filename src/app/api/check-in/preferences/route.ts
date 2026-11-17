import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { GUEST_SESSION_COOKIE, parseGuestSession, verifyGuestSessionAccess } from '@/lib/guestSession';
import { isAdminRequest } from '@/lib/rbac';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { timePattern, wifiDisclosureWindow } from '@/lib/propertyTime';

const preferencesSchema = z.object({
  checkInTime: z.string().regex(timePattern, 'Check-in time must be in HH:MM format'),
  checkOutTime: z.string().regex(timePattern, 'Check-out time must be in HH:MM format'),
});

const PREFERENCES_KEY = 'checkin_preferences';

type CheckInPreferences = {
  checkInTime: string;
  checkOutTime: string;
  updatedAt: number;
};

function guestWifi(): { network: string; password: string } {
  return {
    network: process.env.GUEST_WIFI_NETWORK || '',
    password: process.env.GUEST_WIFI_PASSWORD || '',
  };
}

async function readPreferences(): Promise<CheckInPreferences> {
  const { prisma } = await import('@/lib/prisma');
  const row = await prisma.operationalSetting.findUnique({ where: { key: PREFERENCES_KEY } });
  const parsed = preferencesSchema.safeParse(row?.value);
  if (!parsed.success) return { checkInTime: '15:00', checkOutTime: '11:00', updatedAt: 0 };
  const value = row?.value as Record<string, unknown>;
  return {
    ...parsed.data,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : row?.updatedAt.getTime() ?? 0,
  };
}

async function writePreferences(prefs: CheckInPreferences): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.operationalSetting.upsert({
    where: { key: PREFERENCES_KEY },
    create: { key: PREFERENCES_KEY, value: prefs },
    update: { value: prefs },
  });
}

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const adminAccess = await isAdminRequest(request);
  const guestSession = parseGuestSession(request.cookies.get(GUEST_SESSION_COOKIE)?.value);
  const guestAccess = await verifyGuestSessionAccess(guestSession);
  if (!adminAccess && !guestAccess) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Authentication required to view preferences');
  }

  const prefs = await readPreferences();
  let wifi: { network: string; password: string } | null = null;
  let wifiAvailableAt: string | null = null;
  let wifiPending = false;
  if (adminAccess) {
    wifi = guestWifi();
  } else if (guestAccess?.booking?.id) {
    const { prisma } = await import('@/lib/prisma');
    const booking = await prisma.booking.findUnique({
      where: { id: guestAccess.booking.id },
      select: { startDate: true, endDate: true },
    });
    if (booking) {
      const { revealAt, expiresAt } = wifiDisclosureWindow({
        startDate: booking.startDate,
        endDate: booking.endDate,
        checkInTime: prefs.checkInTime,
        checkOutTime: prefs.checkOutTime,
        timeZone: PROPERTY_TIME_ZONE,
      });
      wifiAvailableAt = revealAt.toISOString();
      const now = new Date();
      wifiPending = now < revealAt;
      if (now >= revealAt && now <= expiresAt) {
        wifi = guestWifi();
      }
    }
  }
  return createSuccessResponse({
    ...prefs,
    wifi,
    wifiAvailableAt,
    wifiPending,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required to update preferences');
  }

  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }

  // Strict for the request body only: readPreferences parses the stored value, which also carries updatedAt.
  const parseBody = validateRequestBody(preferencesSchema.strict(), 4 * 1_024);
  const body = await parseBody(request);

  const prefs: CheckInPreferences = {
    checkInTime: body.checkInTime,
    checkOutTime: body.checkOutTime,
    updatedAt: Date.now(),
  };

  await writePreferences(prefs);

  return createSuccessResponse({
    message: 'Check-in preferences updated successfully',
    preferences: prefs,
  });
});
