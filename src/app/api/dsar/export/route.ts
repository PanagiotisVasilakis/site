import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { guestStore } from '@/lib/guestDataStore';
import { getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import { requireSubjectOrAdmin } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { privacySubjectDigest } from '@/lib/privacyService';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const correlationId = logger.getContext()?.correlationId;

  const session = await getVerifiedGuestSessionFromCookies();
  const sessionUserId = session?.user?.id;
  const sessionUser = sessionUserId ? await guestStore.findUserById(sessionUserId) : undefined;

  // Allow admin to query specific user by user_id or by phone
  const url = new URL(req.url);
  const userIdQuery = url.searchParams.get('user_id') || undefined;
  const phoneQuery = url.searchParams.get('phone') || undefined;
  if ((userIdQuery || phoneQuery) && !(await isAdminRequest(req))) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required for subject queries', undefined, correlationId);
  }

  let subject;
  if (userIdQuery) {
    subject = await guestStore.findUserById(userIdQuery);
  } else if (phoneQuery) {
    subject = await guestStore.findUserByPhone(phoneQuery);
  } else {
    subject = sessionUser;
  }

  if (!subject) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'No subject found (missing session or invalid query)', undefined, correlationId);
  }

  const access = await requireSubjectOrAdmin(req, subject.id, sessionUser?.id);
  if (!access) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Not authorized to export this data', undefined, correlationId);
  }

  const footprint = await prisma.user.findUnique({
    where: { id: subject.id },
    select: {
      id: true,
      email: true,
      phoneE164: true,
      countryOrigin: true,
      createdAt: true,
      updatedAt: true,
      bookings: {
        select: {
          id: true, source: true, reference: true, provider: true, externalReference: true,
          startDate: true, endDate: true, accessStatus: true, claimedAt: true, createdAt: true,
          checkin: { select: { arrivalTime: true, specialRequests: true, acceptedAt: true } },
          claimGrants: {
            select: { id: true, channel: true, expiresAt: true, consumedAt: true, revokedAt: true, createdAt: true },
          },
        },
      },
      sessions: { select: { id: true, bookingId: true, expiresAt: true, revokedAt: true, createdAt: true } },
      refreshFamilies: {
        select: { id: true, absoluteExpiresAt: true, revokedAt: true, revocationReason: true, createdAt: true },
      },
      refreshTokens: {
        select: {
          id: true, familyId: true, createdAt: true, expiresAt: true, revokedAt: true,
          rotatedFromId: true, lastUsedAt: true, deviceHint: true, ipHint: true,
        },
      },
      checkInRequests: {
        select: {
          id: true, bookingId: true, guestName: true, guestEmail: true, guestPhone: true,
          requestedTime: true, message: true, status: true, createdAt: true, updatedAt: true,
        },
      },
      mfaFactors: {
        select: { id: true, type: true, status: true, createdAt: true, activatedAt: true, lastUsedAt: true },
      },
      mfaChallenges: {
        select: { id: true, factorId: true, expiresAt: true, completedAt: true, createdAt: true },
      },
      termsAcceptances: {
        select: { bookingId: true, termsVersion: true, contentHash: true, acceptedAt: true },
      },
      privacyRequests: {
        select: { id: true, bookingId: true, requestType: true, status: true, requestedAt: true, completedAt: true },
      },
    },
  });
  if (!footprint) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Subject no longer exists', undefined, correlationId);

  const stayRequests = await prisma.stayRequest.findMany({
    where: {
      OR: [
        ...(footprint.email ? [{ email: footprint.email }] : []),
        { phone: footprint.phoneE164 },
      ],
    },
    select: {
      id: true, propertyName: true, locale: true, startDate: true, endDate: true,
      firstName: true, lastName: true, email: true, phone: true, arrivalTime: true,
      specialRequests: true, status: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const response = {
    subject: footprint,
    stayRequests,
    generated_at: new Date().toISOString(),
    excluded_secret_material: [
      'password hashes', 'claim token digests', 'refresh token and device hashes',
      'MFA secrets and challenge codes', 'JWT values',
    ],
  };

  await prisma.privacyRequest.create({
    data: {
      id: crypto.randomUUID(),
      userId: subject.id,
      subjectDigest: privacySubjectDigest('user', subject.id),
      requestType: 'EXPORT',
      status: 'COMPLETED',
      completedAt: new Date(),
      auditNote: access === 'admin'
        ? 'Data export completed by an authorized administrator.'
        : 'Data export completed for the authenticated data subject.',
    },
  });

  const result = createSuccessResponse(response, 200, correlationId);
  result.headers.set('content-disposition', `attachment; filename="personal-data-${subject.id}.json"`);
  result.headers.set('cache-control', 'no-store, private');
  return result;
});
