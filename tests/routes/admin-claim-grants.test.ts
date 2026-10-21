import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAdminSession: vi.fn(),
  issueBookingClaimGrant: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ verifyAdminSession: mocks.verifyAdminSession }));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  issueBookingClaimGrant: mocks.issueBookingClaimGrant,
}));

import { POST } from '@/app/api/admin/bookings/[id]/claim-grants/route';

const BOOKING_ID = '1826a63a-4b2f-405c-820a-4f5abf23c6cb';
const ADMIN_SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';
const ATTESTATION = 'b'.repeat(64);

function issue(options: {
  url?: string;
  id?: string;
  body?: unknown;
  headers?: Record<string, string>;
  // null sends no admin cookie at all.
  cookie?: string | null;
}): Promise<Response> {
  const id = options.id ?? BOOKING_ID;
  // Route handlers see the server bind host in request.url (e.g. `next dev -H 0.0.0.0`).
  const url = options.url ?? `http://0.0.0.0:3000/api/admin/bookings/${id}/claim-grants`;
  const request = new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie === null ? {} : { cookie: options.cookie ?? 'admin_jwt=signed' }),
      ...options.headers,
    },
    body: JSON.stringify(options.body ?? { channel: 'REMOTE' }),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe('admin claim-grant issuance origin and id checks', () => {
  beforeEach(() => {
    mocks.verifyAdminSession.mockResolvedValue({ session_id: ADMIN_SESSION_ID });
    mocks.issueBookingClaimGrant.mockResolvedValue({
      token: `claim_${'T'.repeat(43)}`,
      expiresAt: new Date('2030-01-01T00:30:00.000Z'),
    });
  });

  it('accepts a same-origin browser request although the server is bound to another host', async () => {
    const response = await issue({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });

    expect(response.status).toBe(201);
    expect(mocks.issueBookingClaimGrant).toHaveBeenCalledWith(expect.objectContaining({ bookingId: BOOKING_ID }));
  });

  it('accepts the public HTTPS origin behind the attested ingress hop', async () => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', ATTESTATION);
    const response = await issue({
      url: `http://localhost:3000/api/admin/bookings/${BOOKING_ID}/claim-grants`,
      headers: {
        origin: 'https://guide.example',
        host: 'guide.example',
        'x-forwarded-proto': 'https',
        'x-origin-proxy-attestation': ATTESTATION,
        'x-origin-verified-client-ip': '203.0.113.7',
      },
    });

    expect(response.status).toBe(201);
  });

  it.each([
    ['a foreign origin', { origin: 'https://evil.example', host: 'localhost:3000' }],
    ['an opaque origin', { origin: 'null', host: 'localhost:3000' }],
    ['an unattested forwarded protocol', { origin: 'https://localhost:3000', host: 'localhost:3000', 'x-forwarded-proto': 'https' }],
  ])('rejects %s', async (_label, headers) => {
    const response = await issue({ headers });

    expect(response.status).toBe(403);
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('answers 409 with guidance when the booking is outside the claim window', async () => {
    const { PortalAuthError } = await import('@/lib/portalAuthService');
    mocks.issueBookingClaimGrant.mockRejectedValue(new PortalAuthError('BOOKING_NOT_IN_ACCESS_WINDOW'));

    const response = await issue({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('7 days before check-in until the check-out date (UTC calendar dates)');
  });

  it('answers 404 for a booking id that is not a UUID without reaching the database layer', async () => {
    const response = await issue({ id: 'not-a-uuid', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });

    expect(response.status).toBe(404);
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('answers 422 for an unknown body key instead of issuing a grant with the default lifetime', async () => {
    const response = await issue({
      body: { channel: 'REMOTE', ttlMinute: 5 },
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });

    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toContain('unrecognized_keys');
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('still accepts the body the admin page sends (channel and ttlMinutes)', async () => {
    const response = await issue({
      body: { channel: 'ONSITE', ttlMinutes: 30 },
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });

    expect(response.status).toBe(201);
    expect(mocks.issueBookingClaimGrant).toHaveBeenCalledWith(expect.objectContaining({ channel: 'ONSITE', ttlMinutes: 30 }));
  });
});

describe('admin claim-grant issuance authentication', () => {
  const SAME_ORIGIN = { origin: 'http://localhost:3000', host: 'localhost:3000' };

  beforeEach(() => {
    mocks.verifyAdminSession.mockResolvedValue({ session_id: ADMIN_SESSION_ID });
    mocks.issueBookingClaimGrant.mockResolvedValue({
      token: `claim_${'T'.repeat(43)}`,
      expiresAt: new Date('2030-01-01T00:30:00.000Z'),
    });
  });

  it('issues a grant for the admin session that the cookie names', async () => {
    const response = await issue({ headers: SAME_ORIGIN });

    expect(response.status).toBe(201);
    expect(mocks.verifyAdminSession).toHaveBeenCalledWith('signed');
    expect(mocks.issueBookingClaimGrant).toHaveBeenCalledWith(expect.objectContaining({ adminSessionId: ADMIN_SESSION_ID }));
  });

  it('answers 401 without an admin cookie and issues nothing', async () => {
    const response = await issue({ cookie: null, headers: SAME_ORIGIN });

    expect(response.status).toBe(401);
    expect(mocks.verifyAdminSession).not.toHaveBeenCalled();
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });

  it.each([
    ['a session that is forged, expired or revoked', null],
    ['a session without an identifier', { type: 'admin', role: 'admin' }],
  ])('answers 401 for %s and issues nothing', async (_label, session) => {
    mocks.verifyAdminSession.mockResolvedValue(session);

    const response = await issue({ headers: SAME_ORIGIN });

    expect(response.status).toBe(401);
    expect(mocks.verifyAdminSession).toHaveBeenCalledWith('signed');
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('checks the session before the origin, the booking id and the body', async () => {
    const response = await issue({
      cookie: null,
      id: 'not-a-uuid',
      body: { channel: 'SMOKE_SIGNAL' },
      headers: { origin: 'https://evil.example', host: 'localhost:3000' },
    });

    expect(response.status).toBe(401);
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });
});
