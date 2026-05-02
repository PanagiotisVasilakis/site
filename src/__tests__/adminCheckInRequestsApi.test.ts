import { NextRequest } from 'next/server';
import { signAdmin } from '@/lib/auth/admin';

const ADMIN_SECRET = 'test-admin-secret-for-requests';
const ADMIN_JWT_SECRET = 'a'.repeat(32);
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

type MockRepository = {
  list: ReturnType<typeof vi.fn>;
  getStatusCounts: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
};

let repository: MockRepository;

function makeReq(url: string, init?: RequestInit & { cookies?: Record<string, string> }) {
  const base = new URL(url, 'http://localhost');
  const headers = new Headers(init?.headers);
  if (init?.cookies) {
    headers.set('cookie', Object.entries(init.cookies).map(([key, value]) => `${key}=${value}`).join('; '));
  }

  return new NextRequest(base, {
    method: init?.method,
    headers,
    body: init?.body,
  });
}

function validAdminCookie() {
  return {
    admin_jwt: signAdmin({ jti: 'test-admin-token' }),
  };
}

function validAdminHeaders(contentType = false) {
  return {
    'x-admin-secret': ADMIN_SECRET,
    ...(contentType ? { 'content-type': 'application/json' } : {}),
  };
}

function requestRecord(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
  return {
    id: REQUEST_ID,
    booking_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    guest_name: 'Test Guest',
    guest_email: 'guest@example.com',
    guest_phone: '+306900000000',
    requested_time: '13:30',
    message: 'Early flight',
    status,
    created_at: Date.now() - 1000,
    updated_at: Date.now(),
  };
}

async function importListRoute() {
  return import('@/app/api/admin/check-in-requests/route');
}

async function importPatchRoute() {
  return import('@/app/api/admin/check-in-requests/[id]/route');
}

describe('admin check-in requests API', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_DASH_SECRET = ADMIN_SECRET;
    process.env.ADMIN_JWT_SECRET = ADMIN_JWT_SECRET;

    repository = {
      list: vi.fn().mockResolvedValue([requestRecord()]),
      getStatusCounts: vi.fn().mockResolvedValue({
        pending: 1,
        approved: 0,
        rejected: 0,
        total: 1,
      }),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };

    vi.doMock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
      checkInRequestRepository: repository,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/prisma-repositories/checkInRequestRepository');
  });

  it('rejects unauthenticated admin list requests', async () => {
    const { GET } = await importListRoute();
    const res = await GET(makeReq('/api/admin/check-in-requests') as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('rejects requests with a valid JWT but missing admin secret', async () => {
    const { GET } = await importListRoute();
    const req = makeReq('/api/admin/check-in-requests', {
      cookies: validAdminCookie(),
    });

    const res = await GET(req as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('rejects requests with the admin secret but missing or invalid JWT', async () => {
    const { GET } = await importListRoute();

    const missingJwt = await GET(makeReq('/api/admin/check-in-requests', {
      headers: validAdminHeaders(),
    }) as any, { params: Promise.resolve({}) } as any);
    expect(missingJwt.status).toBe(403);

    const invalidJwt = await GET(makeReq('/api/admin/check-in-requests', {
      headers: validAdminHeaders(),
      cookies: { admin_jwt: 'not-a-valid-jwt' },
    }) as any, { params: Promise.resolve({}) } as any);
    expect(invalidJwt.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('lists requests for a valid admin and maps the status filter', async () => {
    const { GET } = await importListRoute();
    const req = makeReq('/api/admin/check-in-requests?status=approved', {
      headers: validAdminHeaders(),
      cookies: validAdminCookie(),
    });

    const res = await GET(req as any, { params: Promise.resolve({}) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith({ status: 'APPROVED' });
    expect(json.data.requests[0]).toMatchObject({
      id: REQUEST_ID,
      status: 'pending',
      requestedTime: '13:30',
      guestEmail: 'guest@example.com',
    });
  });

  it('returns validation errors for invalid UUIDs', async () => {
    const { PATCH } = await importPatchRoute();
    const req = makeReq('/api/admin/check-in-requests/not-a-uuid', {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'approved' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'not-a-uuid' }) } as any);

    expect(res.status).toBe(422);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('returns validation errors for invalid status values', async () => {
    const { PATCH } = await importPatchRoute();
    const req = makeReq(`/api/admin/check-in-requests/${REQUEST_ID}`, {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'pending' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: REQUEST_ID }) } as any);

    expect(res.status).toBe(422);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown request ids', async () => {
    repository.findById.mockResolvedValue(undefined);
    const { PATCH } = await importPatchRoute();
    const req = makeReq(`/api/admin/check-in-requests/${REQUEST_ID}`, {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'approved' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: REQUEST_ID }) } as any);

    expect(res.status).toBe(404);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('approves pending requests', async () => {
    repository.findById.mockResolvedValue(requestRecord('PENDING'));
    repository.updateStatus.mockResolvedValue(requestRecord('APPROVED'));
    const { PATCH } = await importPatchRoute();
    const req = makeReq(`/api/admin/check-in-requests/${REQUEST_ID}`, {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'approved' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: REQUEST_ID }) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(repository.updateStatus).toHaveBeenCalledWith(REQUEST_ID, 'APPROVED');
    expect(json.data).toMatchObject({
      request: { id: REQUEST_ID, status: 'approved' },
      notification: { status: 'skipped' },
    });
  });

  it('rejects pending requests', async () => {
    repository.findById.mockResolvedValue(requestRecord('PENDING'));
    repository.updateStatus.mockResolvedValue(requestRecord('REJECTED'));
    const { PATCH } = await importPatchRoute();
    const req = makeReq(`/api/admin/check-in-requests/${REQUEST_ID}`, {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'rejected' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: REQUEST_ID }) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(repository.updateStatus).toHaveBeenCalledWith(REQUEST_ID, 'REJECTED');
    expect(json.data.request.status).toBe('rejected');
  });

  it('does not update or notify when the status is unchanged', async () => {
    repository.findById.mockResolvedValue(requestRecord('APPROVED'));
    const { PATCH } = await importPatchRoute();
    const req = makeReq(`/api/admin/check-in-requests/${REQUEST_ID}`, {
      method: 'PATCH',
      headers: validAdminHeaders(true),
      cookies: validAdminCookie(),
      body: JSON.stringify({ status: 'approved' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: REQUEST_ID }) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(json.data).toMatchObject({
      request: { id: REQUEST_ID, status: 'approved' },
      notification: { status: 'skipped' },
    });
  });
});
