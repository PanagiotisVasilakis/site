import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import fs from 'node:fs';
import path from 'node:path';
import { encryptJSON, decryptJSON } from '@/lib/crypto';
import { hasVerifiedBookingSession, parseGuestSession } from '@/lib/guestSession';
import { isAdminRequest } from '@/lib/rbac';

const preferencesSchema = z.object({
  checkInTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-in time must be in HH:MM format'),
  checkOutTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-out time must be in HH:MM format'),
});

const PREFERENCES_FILE = path.join(process.cwd(), 'data', 'secure', 'checkin-preferences.enc.json');

interface CheckInPreferences {
  checkInTime: string;
  checkOutTime: string;
  updatedAt: number;
}

function readPreferences(): CheckInPreferences {
  if (!fs.existsSync(PREFERENCES_FILE)) {
    // Default times
    return {
      checkInTime: '15:00',
      checkOutTime: '11:00',
      updatedAt: Date.now(),
    };
  }
  try {
    const raw = fs.readFileSync(PREFERENCES_FILE, 'utf-8');
    return decryptJSON<CheckInPreferences>(raw);
  } catch {
    return {
      checkInTime: '15:00',
      checkOutTime: '11:00',
      updatedAt: Date.now(),
    };
  }
}

function writePreferences(prefs: CheckInPreferences) {
  const encrypted = encryptJSON(prefs);
  fs.writeFileSync(PREFERENCES_FILE, encrypted, 'utf-8');
}

export const dynamic = 'force-dynamic';

// GET: Retrieve current preferences
export const GET = withErrorHandler(async (request: NextRequest) => {
  const adminAccess = isAdminRequest(request);
  const guestSession = parseGuestSession(request.cookies.get('guest_session')?.value);
  const guestAccess = hasVerifiedBookingSession(guestSession);
  if (!adminAccess && !guestAccess) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Authentication required to view preferences');
  }

  const prefs = readPreferences();
  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({ ...prefs, canEdit: adminAccess }, undefined, correlationId);
});

// POST: Update preferences (admin-only)
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Basic security checks only (content type, XSS/SQLi)
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  if (!isAdminRequest(request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required to update preferences');
  }

  const parseBody = validateRequestBody(preferencesSchema);
  const body = await parseBody(request);

  const prefs: CheckInPreferences = {
    checkInTime: body.checkInTime,
    checkOutTime: body.checkOutTime,
    updatedAt: Date.now(),
  };

  writePreferences(prefs);

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;

  return createSuccessResponse({
    message: 'Check-in preferences updated successfully',
    preferences: prefs,
  }, undefined, correlationId);
});
