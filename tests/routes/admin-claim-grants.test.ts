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
const ATTESTATION = 'b'.repeat(64);

function issue(options: {
  url?: string;
  id?: string;
  headers?: Record<string, string>;
}): Promise<Response> {
  const id = options.id ?? BOOKING_ID;
  // Route handlers see the server bind host in request.url (e.g. `next dev -H 0.0.0.0`).
  const url = options.url ?? `http://0.0.0.0:3000/api/admin/bookings/${id}/claim-grants`;
  const request = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'admin_jwt=signed', ...options.headers },
    body: JSON.stringify({ channel: 'REMOTE' }),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe('admin claim-grant issuance origin and id checks', () => {
  beforeEach(() => {
    mocks.verifyAdminSession.mockResolvedValue({ session_id: '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11' });
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
    expect(JSON.stringify(await response.json())).toContain('7 days before check-in');
  });

  it('answers 404 for a booking id that is not a UUID without reaching the database layer', async () => {
    const response = await issue({ id: 'not-a-uuid', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });

    expect(response.status).toBe(404);
    expect(mocks.issueBookingClaimGrant).not.toHaveBeenCalled();
  });
});
