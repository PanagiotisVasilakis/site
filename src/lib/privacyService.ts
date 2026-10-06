import crypto from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import type { PrivacyRequest } from '@/generated/prisma/client';

import { prisma } from '@/lib/prisma';

function privacySubjectDigest(kind: 'user' | 'booking', id: string): string {
  return crypto.createHash('sha256').update(`privacy-subject:v1:${kind}:${id}`).digest('hex');
}

/**
 * Erase one guest on the host's instruction (admin UI). The host verifies the
 * guest's identity out of band; the audit note records why and on whose request.
 */
export async function eraseGuestByAdmin(userId: string, auditNote: string) {
  const subject = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!subject) throw new Error('ERASURE_SUBJECT_NOT_FOUND');
  const { request } = await createVerifiedErasureRequest(userId, auditNote);
  return completeErasureRequest(request.id, auditNote);
}

/**
 * Erase one guest for automatic retention, only if every booking of the guest still
 * ended before `bookingsEndedBefore`. The predicate is re-checked inside the erasure
 * transaction, so a booking claimed after the caller selected the guest keeps the
 * account. Returns false (nothing erased) when the predicate no longer holds or the
 * guest is already gone; otherwise it is the same audited erasure as eraseGuestByAdmin.
 */
export async function eraseGuestForRetention(userId: string, auditNote: string, bookingsEndedBefore: Date) {
  const subject = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!subject) return false;
  const { request, created } = await createVerifiedErasureRequest(userId, auditNote);
  const completed = await completeErasureRequest(request.id, auditNote, { bookingsEndedBefore, createdRequest: created });
  return completed !== null;
}

async function createVerifiedErasureRequest(userId: string, auditNote: string) {
  const existing = await prisma.privacyRequest.findFirst({
    where: {
      userId,
      requestType: 'ERASURE',
      status: { in: ['PENDING', 'VERIFIED'] },
    },
    orderBy: { requestedAt: 'desc' },
  });
  if (existing) return { request: await ensureVerified(existing, auditNote), created: false };

  try {
    const request = await prisma.privacyRequest.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        subjectDigest: privacySubjectDigest('user', userId),
        requestType: 'ERASURE',
        status: 'VERIFIED',
        auditNote: auditNote.slice(0, 1_024),
      },
    });
    return { request, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.privacyRequest.findFirst({
        where: { userId, requestType: 'ERASURE', status: { in: ['PENDING', 'VERIFIED'] } },
        orderBy: { requestedAt: 'desc' },
      });
      if (raced) return { request: await ensureVerified(raced, auditNote), created: false };
    }
    throw error;
  }
}

// The application writes only VERIFIED erasure requests; a PENDING row is legacy
// data from the removed self-service flow. The admin has verified the guest, so
// upgrade it instead of letting completion refuse it. The upgrade is guarded on
// the row still being PENDING so a stale read cannot overwrite a request that a
// concurrent call already completed; completion re-reads the row in its
// transaction and decides from the current status.
async function ensureVerified<T extends { id: string; status: string }>(request: T, auditNote: string) {
  if (request.status !== 'PENDING') return request;
  await prisma.privacyRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: { status: 'VERIFIED', auditNote: auditNote.slice(0, 1_024) },
  });
  return request;
}

type RetentionGuard = { bookingsEndedBefore: Date; createdRequest: boolean };

async function completeErasureRequest(requestId: string, auditNote: string): Promise<PrivacyRequest>;
async function completeErasureRequest(
  requestId: string,
  auditNote: string,
  guard: RetentionGuard,
): Promise<PrivacyRequest | null>;
async function completeErasureRequest(requestId: string, auditNote: string, guard?: RetentionGuard) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.privacyRequest.findUnique({ where: { id: requestId } });
    if (!request || request.requestType !== 'ERASURE') throw new Error('ERASURE_REQUEST_NOT_FOUND');
    if (request.status === 'COMPLETED') return request;
    if (request.status !== 'VERIFIED' || !request.userId) throw new Error('ERASURE_REQUEST_NOT_VERIFIED');

    const user = await tx.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        bookings: { select: { id: true, endDate: true } },
      },
    });
    if (guard) {
      const stillExpired = user !== null && user.bookings.length > 0
        && user.bookings.every((booking) => booking.endDate < guard.bookingsEndedBefore);
      if (!stillExpired) {
        // Skipped: drop the request this call created so no VERIFIED request is left behind.
        if (guard.createdRequest) await tx.privacyRequest.delete({ where: { id: request.id } });
        return null;
      }
    }
    if (!user) throw new Error('ERASURE_SUBJECT_NOT_FOUND');

    const bookingIds = user.bookings.map((booking) => booking.id);

    const checkInRequests = await tx.checkInRequest.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(bookingIds.length ? [{ bookingId: { in: bookingIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const checkInRequestIds = checkInRequests.map((entry) => entry.id);
    if (checkInRequestIds.length) {
      const activeDeliveries = await tx.outboxEvent.count({
        where: {
          status: 'LEASED',
          leaseExpiresAt: { gt: new Date() },
          checkInRequestId: { in: checkInRequestIds },
        },
      });
      if (activeDeliveries > 0) throw new Error('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY');
      await tx.outboxEvent.updateMany({
        where: {
          checkInRequestId: { in: checkInRequestIds },
          status: { in: ['PENDING', 'LEASED'] },
        },
        data: {
          payload: { redacted: true, reason: 'privacy_erasure' },
          status: 'DEAD',
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: 'Delivery cancelled because the data subject was erased.',
        },
      });
    }

    if (bookingIds.length) {
      await tx.checkInRequest.updateMany({
        where: { OR: [{ userId: user.id }, { bookingId: { in: bookingIds } }] },
        data: { userId: null, guestName: null, guestEmail: null, guestPhone: null, message: null },
      });
      await tx.bookingClaimGrant.updateMany({
        where: { bookingId: { in: bookingIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // R-195 decision (a): externalReference is kept on erasure. It is the host's own
      // platform reservation code (bookkeeping link to the Airbnb reservation, GDPR Art. 17(3)(b))
      // and identifies no one by itself once userId is cleared. Tax retention period still to be
      // confirmed by the accountant. Option (b), keeping TermsAcceptance, was NOT done: it is still
      // deleted with the user via onDelete: Cascade.
      await tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: {
          userId: null,
          accessStatus: 'PENDING',
          claimedAt: null,
        },
      });
    } else {
      await tx.checkInRequest.updateMany({
        where: { userId: user.id },
        data: { userId: null, guestName: null, guestEmail: null, guestPhone: null, message: null },
      });
    }

    await tx.user.delete({ where: { id: user.id } });
    const completedAt = new Date();
    const completed = await tx.privacyRequest.update({
      where: { id: request.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        auditNote: auditNote.slice(0, 1_024),
      },
    });
    await tx.securityAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: 'privacy.erasure.completed',
        severity: 'medium',
        details: { requestId: request.id, subjectDigest: request.subjectDigest },
      },
    });
    return completed;
  }, { isolationLevel: 'Serializable' });
}
