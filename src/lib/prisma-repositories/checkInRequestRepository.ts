import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { CheckInRequestStatus } from '@/generated/prisma/client';
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

type ListCheckInRequestParams = {
  status?: CheckInRequestStatus;
  limit?: number;
};

export type CheckInRequestStatusCounts = {
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

async function create(input: CreateCheckInRequestInput): Promise<CheckInRequestRecord> {
  try {
    const request = await prisma.checkInRequest.create({
      data: {
        id: crypto.randomUUID(),
        bookingId: input.bookingId ?? null,
        userId: input.userId ?? null,
        guestName: input.guestName ?? null,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        requestedTime: input.requestedTime,
        message: input.message ?? null,
      },
    });

    logger.info('Check-in request created', {
      requestId: request.id,
      bookingId: input.bookingId,
      userId: input.userId,
    });
    return mapRequest(request);
  } catch (error) {
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
      where: {
        OR: [
          ...(params.bookingId ? [{ bookingId: params.bookingId }] : []),
          ...(params.userId ? [{ userId: params.userId }] : []),
        ],
      },
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

async function updateStatus(id: string, status: CheckInRequestStatus): Promise<CheckInRequestRecord> {
  try {
    const request = await prisma.checkInRequest.update({
      where: { id },
      data: { status },
    });

    logger.info('Check-in request status updated', {
      requestId: id,
      status,
    });
    return mapRequest(request);
  } catch (error) {
    logger.error('checkInRequestRepository(prisma): updateStatus failed', error);
    throw error;
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
