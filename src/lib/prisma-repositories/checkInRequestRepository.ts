import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { adminListPageArgs, toAdminListPage } from '@/lib/adminListPage';
import { retrySerializable } from '@/lib/serializableRetry';
import { CheckInRequestStatus, Prisma } from '@/generated/prisma/client';
import type { CheckInRequest, OutboxStatus } from '@/generated/prisma/client';
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
  /**
   * Webhook notification status; set by list() only. Notifications cancelled by
   * a privacy erasure are ignored. DEAD when any other notification failed for
   * good, otherwise the status of the newest remaining one; unset when there is
   * none, including when an erasure cancelled them all.
   */
  notification_status?: 'PENDING' | 'LEASED' | 'DELIVERED' | 'DEAD';
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

type NotificationEvent = {
  eventType: 'check_in_time_request.created' | 'check_in_time_request.updated';
  previousStatus?: CheckInRequestStatus;
  nextStatus: CheckInRequestStatus;
};

type ListCheckInRequestParams = {
  status?: CheckInRequestStatus;
  limit?: number;
  cursor?: string;
};

type CheckInRequestStatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
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

async function create(
  input: CreateCheckInRequestInput,
  notification?: NotificationEvent,
): Promise<{ request: CheckInRequestRecord; notificationEventId?: string; created: boolean }> {
  try {
    const requestId = crypto.randomUUID();
    const notificationEventId = notification && process.env.CHECKIN_REQUEST_WEBHOOK_URL
      ? crypto.randomUUID()
      : undefined;
    const request = await prisma.checkInRequest.create({
      data: {
        id: requestId,
        bookingId: input.bookingId ?? null,
        userId: input.userId ?? null,
        guestName: input.guestName ?? null,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        requestedTime: input.requestedTime,
        message: input.message ?? null,
        ...(notificationEventId && notification ? {
          outboxEvents: {
            create: {
              id: notificationEventId,
              eventType: notification.eventType,
              destination: 'checkin_request_webhook',
              aggregateType: 'check_in_request',
              aggregateId: requestId,
              idempotencyKey: `${notification.eventType}:${requestId}`,
              payload: {
                previousStatus: notification.previousStatus ?? null,
                status: notification.nextStatus,
              },
            },
          },
        } : {}),
      },
    });

    logger.info('Check-in request created', {
      requestId: request.id,
      bookingId: input.bookingId,
      userId: input.userId,
    });
    return { request: mapRequest(request), notificationEventId, created: true };
  } catch (error) {
    if (
      input.bookingId
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const existing = await prisma.checkInRequest.findFirst({
        where: { bookingId: input.bookingId, status: CheckInRequestStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        logger.info('Reused existing pending check-in request', {
          requestId: existing.id,
          bookingId: input.bookingId,
        });
        return { request: mapRequest(existing), created: false };
      }
    }
    logger.error('checkInRequestRepository(prisma): create failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<CheckInRequestRecord | undefined> {
  const request = await prisma.checkInRequest.findUnique({
    where: { id },
  });

  return request ? mapRequest(request) : undefined;
}

async function findLatestForGuest(params: { bookingId?: string; userId?: string }): Promise<CheckInRequestRecord | undefined> {
  if (!params.bookingId && !params.userId) return undefined;

  const request = await prisma.checkInRequest.findFirst({
    where: params.bookingId
      ? {
          OR: [
            { bookingId: params.bookingId },
            ...(params.userId ? [{ bookingId: null, userId: params.userId }] : []),
          ],
        }
      : { userId: params.userId },
    orderBy: { createdAt: 'desc' },
  });

  return request ? mapRequest(request) : undefined;
}

// A privacy erasure cancels undelivered events by marking them DEAD with the
// payload replaced by { redacted: true } (privacyService.ts); those are not
// delivery failures.
function isErasureCancelled(payload: Prisma.JsonValue): boolean {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && payload.redacted === true;
}

// Events cancelled by a privacy erasure are ignored. A failed notification must
// stay visible, and retryable, behind a newer event (created, then decided), so
// a real failure wins over the newest remaining status; there is no status when
// an erasure cancelled every event. `events` are newest first.
function notificationStatus(events: { status: OutboxStatus; payload: Prisma.JsonValue }[]): OutboxStatus | undefined {
  const live = events.filter((event) => !(event.status === 'DEAD' && isErasureCancelled(event.payload)));
  return live.some((event) => event.status === 'DEAD') ? 'DEAD' : live[0]?.status;
}

async function list(
  params: ListCheckInRequestParams = {},
): Promise<{ requests: CheckInRequestRecord[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const rows = await prisma.checkInRequest.findMany({
    where: params.status ? { status: params.status } : undefined,
    ...adminListPageArgs(limit, params.cursor),
    include: { outboxEvents: { orderBy: { createdAt: 'desc' }, select: { status: true, payload: true } } },
  });
  const page = toAdminListPage(rows, limit, params.cursor);
  return {
    requests: page.items.map((row) => ({ ...mapRequest(row), notification_status: notificationStatus(row.outboxEvents) })),
    nextCursor: page.nextCursor,
  };
}

async function updateStatus(
  id: string,
  status: CheckInRequestStatus,
): Promise<{ request: CheckInRequestRecord; notificationEventId?: string; changed: boolean }> {
  const result = await retrySerializable(() => prisma.$transaction(async (tx) => {
    const current = await tx.checkInRequest.findUnique({ where: { id } });
    if (!current) throw new CheckInRequestNotFoundError(id);
    if (current.status === status) return { request: current, changed: false };
    // A decision is final: checked inside the transaction so two admins
    // deciding at once cannot flip each other's answer.
    if (current.status !== CheckInRequestStatus.PENDING) throw new CheckInRequestAlreadyDecidedError(id);

    const updated = await tx.checkInRequest.update({ where: { id }, data: { status } });
    const notificationEventId = process.env.CHECKIN_REQUEST_WEBHOOK_URL
      ? crypto.randomUUID()
      : undefined;
    if (notificationEventId) {
      await tx.outboxEvent.create({
        data: {
          id: notificationEventId,
          eventType: 'check_in_time_request.updated',
          destination: 'checkin_request_webhook',
          aggregateType: 'check_in_request',
          aggregateId: id,
          idempotencyKey: `check_in_time_request.updated:${id}:${status}:${updated.updatedAt.toISOString()}`,
          payload: { previousStatus: current.status, status },
          checkInRequestId: id,
        },
      });
    }
    return { request: updated, notificationEventId, changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  logger.info('Check-in request status updated', {
    requestId: id,
    status,
    changed: result.changed,
  });
  return { request: mapRequest(result.request), notificationEventId: result.notificationEventId, changed: result.changed };
}

export class CheckInRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Check-in request ${id} was not found`);
    this.name = 'CheckInRequestNotFoundError';
  }
}

export class CheckInRequestAlreadyDecidedError extends Error {
  constructor(id: string) {
    super(`Check-in request ${id} was already approved or rejected`);
    this.name = 'CheckInRequestAlreadyDecidedError';
  }
}

async function getStatusCounts(): Promise<CheckInRequestStatusCounts> {
  const [pending, approved, rejected] = await prisma.$transaction([
    prisma.checkInRequest.count({ where: { status: CheckInRequestStatus.PENDING } }),
    prisma.checkInRequest.count({ where: { status: CheckInRequestStatus.APPROVED } }),
    prisma.checkInRequest.count({ where: { status: CheckInRequestStatus.REJECTED } }),
  ]);

  return {
    pending,
    approved,
    rejected,
    total: pending + approved + rejected,
  };
}

// Requeues the request's exhausted webhook notifications; the outbox worker
// delivers them on its next run. Returns how many were requeued. Events that
// a privacy erasure cancelled are DEAD too but must never be sent: they are
// found with the positive filter of ERASURE_CANCELLED_OUTBOX
// (operationalMonitor.ts) and excluded by id, because a negated JSON-path
// filter could also drop the ordinary events, which have no `redacted` key.
// Without cancelled events no `id` clause is sent.
async function retryFailedNotifications(id: string): Promise<number> {
  const cancelled = await prisma.outboxEvent.findMany({
    where: { checkInRequestId: id, status: 'DEAD', payload: { path: ['redacted'], equals: true } },
    select: { id: true },
  });
  const retried = await prisma.outboxEvent.updateMany({
    where: {
      checkInRequestId: id,
      status: 'DEAD',
      ...(cancelled.length > 0 ? { id: { notIn: cancelled.map((event) => event.id) } } : {}),
    },
    data: {
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  return retried.count;
}

export const checkInRequestRepository = {
  create,
  findById,
  findLatestForGuest,
  list,
  retryFailedNotifications,
  updateStatus,
  getStatusCounts,
};
