import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  findById: vi.fn(),
  retryFailedNotifications: vi.fn(),
  updateStatus: vi.fn(),
  deliverOutboxEvent: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/bookingOutbox', () => ({ deliverOutboxEvent: mocks.deliverOutboxEvent }));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/prisma-repositories/checkInRequestRepository')>()),
  checkInRequestRepository: {
    findById: mocks.findById,
    retryFailedNotifications: mocks.retryFailedNotifications,
    updateStatus: mocks.updateStatus,
  },
}));

import { PATCH as patchCheckInRequest } from '@/app/api/admin/check-in-requests/[id]/route';
import { logger } from '@/lib/logger-enterprise';

const CHECK_IN_ID = '75000000-0000-4000-8000-000000000002';

function patch(handler: typeof patchCheckInRequest, path: string, id: string, body: unknown) {
  return handler(new NextRequest(`http://localhost:3000${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.isAdminRequest.mockResolvedValue(true);
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

  it('rejects a body that mixes a retry with a decision', async () => {
    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { action: 'retry_delivery', status: 'approved' });

    expect(response.status).toBe(422);
    expect(mocks.updateStatus).not.toHaveBeenCalled();
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

describe('deciding a check-in request', () => {
  it('answers 200 with a queued notification when the immediate delivery fails', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    mocks.findById.mockResolvedValue({ id: CHECK_IN_ID, status: 'PENDING' });
    mocks.updateStatus.mockResolvedValue({ request: { id: CHECK_IN_ID, status: 'APPROVED' }, notificationEventId: 'event-1', changed: true });
    mocks.deliverOutboxEvent.mockRejectedValue(new Error('connection terminated'));

    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${CHECK_IN_ID}`, CHECK_IN_ID, { status: 'approved' });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ request: { id: CHECK_IN_ID, status: 'approved' }, notification: { status: 'queued' } });
    expect(mocks.deliverOutboxEvent).toHaveBeenCalledWith('event-1');
    expect(warn).toHaveBeenCalledWith('Immediate outbox delivery failed', { eventId: 'event-1', error: 'connection terminated' });
  });
});

describe('addressing a check-in request', () => {
  it.each(['not-a-uuid', '75000000-0000-4000-8000-00000000000g'])('answers 404 for the malformed id %j before reading anything', async (id) => {
    const response = await patch(patchCheckInRequest, `/api/admin/check-in-requests/${id}`, id, { status: 'approved' });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.retryFailedNotifications).not.toHaveBeenCalled();
  });

  it('answers 401 before looking at the id when the admin session is missing', async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    const response = await patch(patchCheckInRequest, '/api/admin/check-in-requests/not-a-uuid', 'not-a-uuid', { status: 'approved' });

    expect(response.status).toBe(401);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });
});
