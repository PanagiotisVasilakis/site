import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  eraseGuestByAdmin: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/privacyService', () => ({ eraseGuestByAdmin: mocks.eraseGuestByAdmin }));

import { POST } from '@/app/api/admin/guests/[userId]/erase/route';

const USER_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';

function erase(body: unknown, options: { userId?: string; origin?: string } = {}): Promise<Response> {
  return POST(new NextRequest(`http://0.0.0.0:3000/api/admin/guests/${options.userId ?? USER_ID}/erase`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: options.origin ?? 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ userId: options.userId ?? USER_ID }) });
}

describe('admin guest erasure route', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.eraseGuestByAdmin.mockResolvedValue({
      id: 'request-1',
      status: 'COMPLETED',
      completedAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('erases the guest with the audit note', async () => {
    const response = await erase({ confirm: true, auditNote: 'Guest asked by email on 2030-01-01' });

    expect(response.status).toBe(200);
    expect(mocks.eraseGuestByAdmin).toHaveBeenCalledWith(USER_ID, 'Guest asked by email on 2030-01-01');
    expect((await response.json()).data).toMatchObject({ requestId: 'request-1', status: 'COMPLETED' });
  });

  it('rejects non-admins, cross-origin calls, unknown ids and unconfirmed requests before erasing', async () => {
    mocks.isAdminRequest.mockResolvedValueOnce(false);
    expect((await erase({ confirm: true, auditNote: 'reason' })).status).toBe(401);
    expect((await erase({ confirm: true, auditNote: 'reason' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await erase({ confirm: true, auditNote: 'reason' }, { userId: 'not-a-uuid' })).status).toBe(404);
    expect((await erase({ auditNote: 'reason' })).status).toBe(422);
    expect((await erase({ confirm: true, auditNote: 'x' })).status).toBe(422);
    expect(mocks.eraseGuestByAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['ERASURE_BLOCKED_BY_ACTIVE_DELIVERY', 409],
    ['ERASURE_SUBJECT_NOT_FOUND', 404],
  ])('maps %s to %i', async (code, status) => {
    mocks.eraseGuestByAdmin.mockRejectedValue(new Error(code));

    expect((await erase({ confirm: true, auditNote: 'reason' })).status).toBe(status);
  });
});
