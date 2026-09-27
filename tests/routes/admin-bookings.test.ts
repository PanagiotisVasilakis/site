import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  bookingCreate: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma', () => ({ prisma: { booking: { create: mocks.bookingCreate } } }));

import { POST } from '@/app/api/admin/bookings/route';

function create(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new NextRequest('http://0.0.0.0:3000/api/admin/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: 'http://localhost:3000', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

describe('admin booking creation', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.bookingCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      accessStatus: 'PENDING',
    }));
  });

  it('creates a pending manual booking stored as UTC-midnight calendar dates', async () => {
    vi.stubEnv('TZ', 'Europe/Athens');

    const response = await create({ startDate: '2026-11-01', endDate: '2026-11-05', source: 'EXTERNAL', externalReference: 'HM123' });

    expect(response.status).toBe(201);
    const data = mocks.bookingCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect((data.startDate as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect((data.endDate as Date).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(data).toMatchObject({ source: 'EXTERNAL', provider: 'manual', externalReference: 'HM123' });
    expect((await response.json()).data.booking).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      accessStatus: 'PENDING',
    });
  });

  it('defaults to an on-site booking without a reference', async () => {
    const response = await create({ startDate: '2026-11-01', endDate: '2026-11-02' });

    expect(response.status).toBe(201);
    expect(mocks.bookingCreate.mock.calls[0][0].data).toMatchObject({ source: 'ONSITE', externalReference: null });
  });

  it('rejects a non-admin request before any write', async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    const response = await create({ startDate: '2026-11-01', endDate: '2026-11-05' });

    expect(response.status).toBe(401);
    expect(mocks.bookingCreate).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin mutation', async () => {
    const response = await create({ startDate: '2026-11-01', endDate: '2026-11-05' }, { origin: 'https://evil.example' });

    expect(response.status).toBe(403);
    expect(mocks.bookingCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['check-out on check-in day', { startDate: '2026-11-01', endDate: '2026-11-01' }],
    ['check-out before check-in', { startDate: '2026-11-05', endDate: '2026-11-01' }],
    ['instants instead of dates', { startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-05T00:00:00.000Z' }],
    ['unknown fields', { startDate: '2026-11-01', endDate: '2026-11-05', userId: 'x' }],
    ['an unknown source', { startDate: '2026-11-01', endDate: '2026-11-05', source: 'AIRBNB' }],
  ])('rejects %s with 422', async (_label, body) => {
    const response = await create(body);

    expect(response.status).toBe(422);
    expect(mocks.bookingCreate).not.toHaveBeenCalled();
  });

  it('answers 409 when the provider reference already exists', async () => {
    mocks.bookingCreate.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    const response = await create({ startDate: '2026-11-01', endDate: '2026-11-05', externalReference: 'HM123' });

    expect(response.status).toBe(409);
  });
});
