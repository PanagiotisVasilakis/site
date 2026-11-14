import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAdminSession: vi.fn(),
  list: vi.fn(),
  getStatusCounts: vi.fn(),
}));

// The session check is mocked and rbac.ts is not: its cookie handling is part of what these tests cover.
vi.mock('@/lib/auth/admin', () => ({ verifyAdminSession: mocks.verifyAdminSession }));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
  checkInRequestRepository: { list: mocks.list, getStatusCounts: mocks.getStatusCounts },
}));

import { GET as listCheckInRequests } from '@/app/api/admin/check-in-requests/route';
import { toAdminListPage } from '@/lib/adminListPage';

const id = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// A null cookie sends no admin cookie at all.
function get(handler: typeof listCheckInRequests, path: string, options: { cookie?: string | null } = {}) {
  const headers: Record<string, string> = options.cookie === null ? {} : { cookie: options.cookie ?? 'admin_jwt=signed' };
  return handler(new NextRequest(`http://localhost:3000${path}`, { headers }), { params: Promise.resolve({}) });
}

describe('toAdminListPage', () => {
  const rows = (...ns: number[]) => ns.map((n) => ({ id: id(n) }));

  it('returns the first page and a cursor when one more row exists', () => {
    expect(toAdminListPage(rows(1, 2, 3), 2)).toEqual({ items: rows(1, 2), nextCursor: id(2) });
  });

  it('drops the cursor row by id and keeps the row after it', () => {
    expect(toAdminListPage(rows(2, 3, 4, 5), 2, id(2))).toEqual({ items: rows(3, 4), nextCursor: id(4) });
  });

  it('keeps every row when the cursor row no longer matches the filter', () => {
    expect(toAdminListPage(rows(3, 4), 2, id(2))).toEqual({ items: rows(3, 4), nextCursor: null });
  });
});

describe('admin check-in request list', () => {
  beforeEach(() => {
    mocks.verifyAdminSession.mockResolvedValue({ session_id: '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11' });
    mocks.getStatusCounts.mockResolvedValue({ pending: 3, approved: 150, rejected: 7, total: 160 });
    mocks.list.mockResolvedValue({ requests: [], nextCursor: id(9) });
  });

  it('passes the page parameters on and reports the count for the filter, not the page length', async () => {
    const response = await get(listCheckInRequests, `/api/admin/check-in-requests?status=approved&limit=50&cursor=${id(1)}`);

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ status: 'APPROVED', limit: 50, cursor: id(1) });
    const body = await response.json();
    expect(body.data).toMatchObject({ requests: [], total: 150, nextCursor: id(9) });
    expect(body.data.summary).toEqual({ pending: 3, approved: 150, rejected: 7, total: 160 });
  });

  it('keeps the previous request shape without page parameters', async () => {
    const response = await get(listCheckInRequests, '/api/admin/check-in-requests?status=all');

    expect(mocks.list).toHaveBeenCalledWith({ status: undefined });
    expect((await response.json()).data.total).toBe(160);
  });

  it.each([
    ['a cursor that is not a UUID', 'cursor=abc'],
    ['a zero limit', 'limit=0'],
    ['a limit above 200', 'limit=201'],
  ])('rejects %s with 422', async (_label, query) => {
    const response = await get(listCheckInRequests, `/api/admin/check-in-requests?${query}`);

    expect(response.status).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('verifies the session that the admin cookie carries', async () => {
    await get(listCheckInRequests, '/api/admin/check-in-requests');

    expect(mocks.verifyAdminSession).toHaveBeenCalledWith('signed');
  });

  it('answers 401 without an admin cookie and reads nothing', async () => {
    const response = await get(listCheckInRequests, '/api/admin/check-in-requests?status=all', { cookie: null });

    expect(response.status).toBe(401);
    expect(mocks.verifyAdminSession).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.getStatusCounts).not.toHaveBeenCalled();
  });

  it('answers 401 for a session that is forged, expired or revoked and reads nothing', async () => {
    mocks.verifyAdminSession.mockResolvedValue(null);

    const response = await get(listCheckInRequests, '/api/admin/check-in-requests?status=all');

    expect(response.status).toBe(401);
    expect(mocks.verifyAdminSession).toHaveBeenCalledWith('signed');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.getStatusCounts).not.toHaveBeenCalled();
  });

  it('checks the session before the query parameters', async () => {
    mocks.verifyAdminSession.mockResolvedValue(null);

    const response = await get(listCheckInRequests, '/api/admin/check-in-requests?status=bogus&limit=0&cursor=abc');

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
