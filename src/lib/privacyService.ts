import crypto from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';

import { prisma } from '@/lib/prisma';

export function privacySubjectDigest(kind: 'user' | 'booking', id: string): string {
  return crypto.createHash('sha256').update(`privacy-subject:v1:${kind}:${id}`).digest('hex');
}

export async function createVerifiedErasureRequest(userId: string, bookingId?: string) {
  const existing = await prisma.privacyRequest.findFirst({
    where: {
      userId,
      requestType: 'ERASURE',
      status: { in: ['PENDING', 'VERIFIED'] },
    },
    orderBy: { requestedAt: 'desc' },
  });
  if (existing) return { request: existing, created: false };

  try {
    const request = await prisma.privacyRequest.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        bookingId: bookingId ?? null,
        subjectDigest: privacySubjectDigest('user', userId),
        requestType: 'ERASURE',
        status: 'VERIFIED',
        auditNote: 'Identity verified through active guest session.',
      },
    });
    return { request, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.privacyRequest.findFirst({
        where: { userId, requestType: 'ERASURE', status: { in: ['PENDING', 'VERIFIED'] } },
        orderBy: { requestedAt: 'desc' },
      });
      if (raced) return { request: raced, created: false };
    }
    throw error;
  }
}

export async function completeErasureRequest(requestId: string, auditNote: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.privacyRequest.findUnique({ where: { id: requestId } });
    if (!request || request.requestType !== 'ERASURE') throw new Error('ERASURE_REQUEST_NOT_FOUND');
    if (request.status === 'COMPLETED') return request;
    if (request.status !== 'VERIFIED' || !request.userId) throw new Error('ERASURE_REQUEST_NOT_VERIFIED');

    const user = await tx.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        bookings: { select: { id: true } },
      },
    });
    if (!user) throw new Error('ERASURE_SUBJECT_NOT_FOUND');

    const bookingIds = user.bookings.map((booking) => booking.id);
    const activeHolds = await tx.privacyHold.count({
      where: {
        releasedAt: null,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        OR: [
          { userId: user.id },
          ...(bookingIds.length ? [{ bookingId: { in: bookingIds } }] : []),
        ],
      },
    });
    if (activeHolds > 0) throw new Error('ERASURE_BLOCKED_BY_ACTIVE_HOLD');

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
    const stayRequestFilters = [
      ...(user.email ? [{ email: user.email }] : []),
      { phone: user.phoneE164 },
    ];
    const stayRequests = await tx.stayRequest.findMany({
      where: { OR: stayRequestFilters },
      select: { id: true },
    });
    const stayRequestIds = stayRequests.map((entry) => entry.id);
    if (checkInRequestIds.length || stayRequestIds.length) {
      const activeDeliveries = await tx.outboxEvent.count({
        where: {
          status: 'LEASED',
          leaseExpiresAt: { gt: new Date() },
          OR: [
            ...(checkInRequestIds.length ? [{ checkInRequestId: { in: checkInRequestIds } }] : []),
            ...(stayRequestIds.length ? [{ stayRequestId: { in: stayRequestIds } }] : []),
          ],
        },
      });
      if (activeDeliveries > 0) throw new Error('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY');
    }
    if (checkInRequestIds.length) {
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

    for (const stayRequest of stayRequests) {
      const suffix = stayRequest.id.replace(/-/g, '').slice(0, 20);
      await tx.stayRequest.update({
        where: { id: stayRequest.id },
        data: {
          firstName: 'Erased',
          lastName: 'Subject',
          email: `erased+${suffix}@invalid.local`,
          phone: '+999000000000',
          arrivalTime: null,
          specialRequests: null,
        },
      });
      await tx.outboxEvent.updateMany({
        where: { stayRequestId: stayRequest.id, status: { in: ['PENDING', 'LEASED'] } },
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
      await tx.checkin.updateMany({
        where: { bookingId: { in: bookingIds } },
        data: { specialRequests: null },
      });
      await tx.bookingClaimGrant.updateMany({
        where: { bookingId: { in: bookingIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: {
          userId: null,
          reference: null,
          externalReference: null,
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
