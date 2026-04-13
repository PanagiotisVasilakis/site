import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import fs from 'node:fs';
import path from 'node:path';
import { encryptJSON, decryptJSON } from '@/lib/crypto';

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
  const prefs = readPreferences();
  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse(prefs, undefined, correlationId);
});

// POST: Update preferences (no auth required - user-friendly)
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Basic security checks only (content type, XSS/SQLi)
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

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
