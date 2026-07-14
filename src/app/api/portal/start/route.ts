import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/start
* Returns a schema describing the guest portal form (origin + conditional fields).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  // Apply input/CORS/SQLi/XSS safeguards (no API key required)
  const guard = createAPISecurityMiddleware();
  const early = guard(req);
  if (early) return early;

  const schema = {
    version: 1,
    steps: [
      {
        id: 'origin',
        fields: [
          {
            name: 'origin',
            type: 'radio',
            required: true,
            options: [
              { value: 'GR', label: 'Greece' },
              { value: 'ABROAD', label: 'Abroad' },
            ],
          },
        ],
      },
      {
        id: 'details',
        fields: [
          {
            name: 'phone',
            type: 'tel',
            required: true,
            help: 'Include country code (e.g., +30...)',
            pattern: '^\\+?[1-9]\\d{7,14}$', // E.164-like
          },
          {
            name: 'afm',
            type: 'text',
            requiredWhen: { origin: 'GR' },
            pattern: '^\\d{9}$',
            help: 'Greek Tax ID (9 digits).',
          },
          {
            name: 'passport',
            type: 'text',
            requiredWhen: { origin: 'ABROAD' },
            pattern: '^[A-Za-z0-9]{5,20}$',
            help: 'Passport number (letters/numbers only, 5–20 chars).',
          },
          {
            name: 'password',
            type: 'password',
            required: true,
            help: 'Required for sign up and future sign in.',
          },
          {
            name: 'bookingRef',
            type: 'text',
            required: false,
            help: 'Optional booking reference if you have one.',
          },
          {
            name: 'lastName',
            type: 'text',
            required: true,
            help: 'Surname as it appears on the booking.',
          },
          {
            name: 'remember',
            type: 'checkbox',
            required: false,
            help: 'Keep me signed in on this device.',
          },
        ],
      },
    ],
  } as const;

  return createSuccessResponse({ schema });
});
