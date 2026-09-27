import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const tx = {
    checkInRequest: { findUnique: vi.fn(), update: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };
  return { tx, $transaction: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  CheckInRequestAlreadyDecidedError,
  checkInRequestRepository,
} from '@/lib/prisma-repositories/checkInRequestRepository';

const ID = '79000000-0000-4000-8000-000000000001';
const row = (status: string) => ({
  id: ID, bookingId: null, userId: null, guestName: null, guestEmail: null, guestPhone: null,
  requestedTime: '17:00', message: null, status, createdAt: new Date(), updatedAt: new Date(),
});

describe('arrival request decisions', () => {
  beforeEach(() => {
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_URL', 'http://127.0.0.1:3999/hook');
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx));
    prismaMock.tx.checkInRequest.update.mockImplementation(async ({ data }: { data: { status: string } }) => row(data.status));
  });

  it('approves a pending request and queues one notification', async () => {
    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(row('PENDING'));

    const result = await checkInRequestRepository.updateStatus(ID, 'APPROVED');

    expect(result.changed).toBe(true);
    expect(prismaMock.tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('refuses to reverse a decision inside the same transaction', async () => {
    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(row('APPROVED'));

    await expect(checkInRequestRepository.updateStatus(ID, 'REJECTED')).rejects.toBeInstanceOf(CheckInRequestAlreadyDecidedError);
    expect(prismaMock.tx.checkInRequest.update).not.toHaveBeenCalled();
    expect(prismaMock.tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('treats repeating the same decision as unchanged', async () => {
    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(row('REJECTED'));

    const result = await checkInRequestRepository.updateStatus(ID, 'REJECTED');

    expect(result.changed).toBe(false);
    expect(prismaMock.tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
