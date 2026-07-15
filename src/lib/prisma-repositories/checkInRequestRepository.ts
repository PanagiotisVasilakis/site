import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { CheckInRequestStatus, Prisma } from '@/generated/prisma/client';
import type { CheckInRequest } from '@/generated/prisma/client';
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
  try {
    const request = await prisma.checkInRequest.findUnique({
      where: { id },
    });

    return request ? mapRequest(request) : undefined;
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): findById failed', error);
    throw error;
  }
}

async function findLatestForGuest(params: { bookingId?: string; userId?: string }): Promise<CheckInRequestRecord | undefined> {
  try {
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
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): findLatestForGuest failed', error);
    throw error;
  }
}

async function list(params: ListCheckInRequestParams = {}): Promise<CheckInRequestRecord[]> {
  try {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const requests = await prisma.checkInRequest.findMany({
      where: params.status ? { status: params.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return requests.map(mapRequest);
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): list failed', error);
    throw error;
  }
}

async function updateStatus(
  id: string,
  status: CheckInRequestStatus,
): Promise<{ request: CheckInRequestRecord; notificationEventId?: string; changed: boolean }> {
  try {
    let result: { request: CheckInRequest; notificationEventId?: string; changed: boolean } | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        result = await prisma.$transaction(async (tx) => {
          const current = await tx.checkInRequest.findUnique({ where: { id } });
          if (!current) throw new CheckInRequestNotFoundError(id);
          if (current.status === status) return { request: current, changed: false };

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
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) continue;
        throw error;
      }
    }
    if (!result) throw new Error('Check-in request update exhausted transaction retries');

    logger.info('Check-in request status updated', {
      requestId: id,
      status,
      changed: result.changed,
    });
    return { request: mapRequest(result.request), notificationEventId: result.notificationEventId, changed: result.changed };
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): updateStatus failed', error);
    throw error;
  }
}

export class CheckInRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Check-in request ${id} was not found`);
    this.name = 'CheckInRequestNotFoundError';
  }
}

async function getStatusCounts(): Promise<CheckInRequestStatusCounts> {
  try {
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
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): getStatusCounts failed', error);
    throw error;
  }
}

async function getAll(): Promise<CheckInRequestRecord[]> {
  return list();
}

export const checkInRequestRepository = {
  create,
  findById,
  findLatestForGuest,
  list,
  updateStatus,
  getStatusCounts,
  getAll,
};
