import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    stayRequest: { findUnique: vi.fn(), update: vi.fn() },
    outboxEvent: { updateMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    tx,
    isAdminRequest: vi.fn(),
    $transaction: vi.fn(),
    findById: vi.fn(),
    retryFailedNotifications: vi.fn(),
    updateStatus: vi.fn(),
  };
});

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.$transaction } }));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/prisma-repositories/checkInRequestRepository')>()),
  checkInRequestRepository: {
    findById: mocks.findById,
    retryFailedNotifications: mocks.retryFailedNotifications,
    updateStatus: mocks.updateStatus,
  },
}));

import { PATCH as patchStayRequest } from '@/app/api/admin/stay-requests/[id]/route';
import { PATCH as patchCheckInRequest } from '@/app/api/admin/check-in-requests/[id]/route';

const STAY_ID = '75000000-0000-4000-8000-000000000001';
const CHECK_IN_ID = '75000000-0000-4000-8000-000000000002';

function patch(handler: typeof patchStayRequest, path: string, id: string, body: unknown) {
  return handler(new NextRequest(`http://localhost:3000${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.isAdminRequest.mockResolvedValue(true);
  mocks.$transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
});

describe('closing a stay request with a failed delivery', () => {
  it('removes its DEAD events so they stop counting towards the alert', async () => {
    mocks.tx.stayRequest.findUnique.mockResolvedValue({ id: STAY_ID, outboxEvents: [{ status: 'DEAD' }] });

    const response = await patch(patchStayRequest, `/api/admin/stay-requests/${STAY_ID}`, STAY_ID, { action: 'close' });

    expect(response.status).toBe(200);
    expect(mocks.tx.outboxEvent.deleteMany).toHaveBeenCalledWith({ where: { stayRequestId: STAY_ID, status: 'DEAD' } });
    expect(mocks.tx.stayRequest.update).toHaveBeenCalledWith({ where: { id: STAY_ID }, data: { status: 'CLOSED' } });
  });

  it.each(['close', 'retry_delivery'])('refuses to %s a request that is already closed', async (action) => {
    mocks.tx.stayRequest.findUnique.mockResolvedValue({ id: STAY_ID, status: 'CLOSED', outboxEvents: [{ status: 'DEAD' }] });

    const response = await patch(patchStayRequest, `/api/admin/stay-requests/${STAY_ID}`, STAY_ID, { action });

    expect(response.status).toBe(409);
    expect(mocks.tx.outboxEvent.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.outboxEvent.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.stayRequest.update).not.toHaveBeenCalled();
  });

  it('refuses while a delivery is pending and removes nothing', async () => {
    mocks.tx.stayRequest.findUnique.mockResolvedValue({ id: STAY_ID, outboxEvents: [{ status: 'PENDING' }] });

    const response = await patch(patchStayRequest, `/api/admin/stay-requests/${STAY_ID}`, STAY_ID, { action: 'close' });

    expect(response.status).toBe(422);
    expect(mocks.tx.outboxEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('retrying a failed check-in request notification', () => {
  beforeEach(() => {
    mocks.findById.mockResolvedValue({ id: CHECK_IN_ID, status: 'APPROVED' });
  });

  it('requeues the DEAD notification', async () => {
    mocks.retryFailedNotifications.mockResolvedValue(1);

    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { action: 'retry_delivery' });

    expect(response.status).toBe(200);
    expect(mocks.retryFailedNotifications).toHaveBeenCalledWith(CHECK_IN_ID);
    expect((await response.json()).data).toEqual({ request: { id: CHECK_IN_ID, status: 'approved' }, notification: { status: 'queued' } });
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('answers 409 when there is no failed notification', async () => {
    mocks.retryFailedNotifications.mockResolvedValue(0);

    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { action: 'retry_delivery' });

    expect(response.status).toBe(409);
  });

  it('answers 404 for an unknown request', async () => {
    mocks.findById.mockResolvedValue(undefined);

    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { action: 'retry_delivery' });

    expect(response.status).toBe(404);
    expect(mocks.retryFailedNotifications).not.toHaveBeenCalled();
  });

  it('rejects an unknown action', async () => {
    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { action: 'delete' });

    expect(response.status).toBe(422);
    expect(mocks.retryFailedNotifications).not.toHaveBeenCalled();
  });

  it('answers 409 when an approved request is rejected', async () => {
    const { CheckInRequestAlreadyDecidedError } = await import('@/lib/prisma-repositories/checkInRequestRepository');
    mocks.updateStatus.mockRejectedValue(new CheckInRequestAlreadyDecidedError(CHECK_IN_ID));

    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { status: 'rejected' });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('Only pending requests');
  });
});
