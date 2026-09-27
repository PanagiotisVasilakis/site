import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  list: vi.fn(),
  getStatusCounts: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
  checkInRequestRepository: { list: mocks.list, getStatusCounts: mocks.getStatusCounts },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { stayRequest: { findMany: mocks.findMany, count: mocks.count } } }));

import { GET as listCheckInRequests } from '@/app/api/admin/check-in-requests/route';
import { GET as listStayRequests } from '@/app/api/admin/stay-requests/route';
import { toAdminListPage } from '@/lib/adminListPage';

const id = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function get(handler: typeof listStayRequests, path: string) {
  return handler(new NextRequest(`http://localhost:3000${path}`), { params: Promise.resolve({}) });
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
    mocks.isAdminRequest.mockResolvedValue(true);
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
});

describe('admin stay request list', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.count.mockResolvedValue(42);
  });

  it('pages with a keyset cursor, drops the cursor row and reports the filtered total', async () => {
    mocks.findMany.mockResolvedValue([{ id: id(2) }, { id: id(3) }, { id: id(4) }, { id: id(5) }]);

    const response = await get(listStayRequests, `/api/admin/stay-requests?status=delivery_failed&limit=2&cursor=${id(2)}`);

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'DELIVERY_FAILED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 4,
      cursor: { id: id(2) },
    }));
    expect(mocks.findMany.mock.calls[0][0]).not.toHaveProperty('skip');
    expect(mocks.count).toHaveBeenCalledWith({ where: { status: 'DELIVERY_FAILED' } });
    expect((await response.json()).data).toEqual({ requests: [{ id: id(3) }, { id: id(4) }], total: 42, nextCursor: id(4) });
  });

  it('keeps the default page of 200 without parameters', async () => {
    mocks.findMany.mockResolvedValue([{ id: id(1) }]);

    const response = await get(listStayRequests, '/api/admin/stay-requests');

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined, take: 202 }));
    expect((await response.json()).data).toEqual({ requests: [{ id: id(1) }], total: 42, nextCursor: null });
  });

  it('rejects an invalid cursor with 422', async () => {
    const response = await get(listStayRequests, '/api/admin/stay-requests?cursor=1%20OR%201');

    expect(response.status).toBe(422);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('requires an admin session', async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    expect((await get(listStayRequests, '/api/admin/stay-requests')).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
