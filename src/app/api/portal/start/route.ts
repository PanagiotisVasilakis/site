import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/start
* Returns the current host-issued claim flow schema.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  // Enforce the shared request content-type and payload-size contract.
  const guard = createAPISecurityMiddleware();
  const early = await guard(req);
  if (early) return early;

  const schema = {
    version: 2,
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
            name: 'claimToken',
            type: 'text',
            required: true,
            help: 'One-time token issued by the host for this booking.',
          },
          {
            name: 'password',
            type: 'password',
            required: true,
            help: 'Required for sign up and future sign in.',
          },
          {
            name: 'acceptTerms',
            type: 'checkbox',
            required: true,
            help: 'Confirm the current portal terms and data processing notice.',
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
