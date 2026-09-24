import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  adminSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: {
    findUnique: vi.fn(),
  },
}));
const refreshTokenRepositoryMock = vi.hoisted(() => ({
  revokeAuthorizationForSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/prisma-repositories/refreshTokenRepository', () => ({
  refreshTokenRepository: refreshTokenRepositoryMock,
}));

import {
  createAdminSession,
  refreshAdminSession,
  revokeAdminSession,
  signAdmin,
  verifyAdmin,
  verifyAdminSession,
} from '@/lib/auth/admin';
import {
  clearRefreshCookie,
  clearSessionCookie,
  createRefreshCookie,
  createSessionCookie,
  issueGuestSession,
  parseGuestSession,
  parseGuestSessionBinding,
  revokeGuestSessionById,
  verifyGuestSessionAccess,
} from '@/lib/guestSession';

const ADMIN_SECRET = 'admin-test-secret-that-is-at-least-32-characters';
const GUEST_SECRET = 'guest-test-secret-that-is-at-least-32-characters';

describe('admin authentication', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_JWT_SECRET', ADMIN_SECRET);
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => vi.useRealTimers());

  it('signs an HS256 admin token with enforced type and role', () => {
    const token = signAdmin({ session_id: 'session-1', login_at: 1_700_000_000 });
    expect(verifyAdmin(token)).toEqual(expect.objectContaining({
      type: 'admin',
      role: 'admin',
      session_id: 'session-1',
    }));
  });

  it('rejects malformed, wrong-role, expired and wrong-algorithm tokens', () => {
    expect(verifyAdmin('not-a-token')).toBeNull();
    expect(verifyAdmin(jwt.sign({ type: 'guest', role: 'guest' }, ADMIN_SECRET, { algorithm: 'HS256' }))).toBeNull();
    expect(verifyAdmin(jwt.sign({ type: 'admin', role: 'admin' }, ADMIN_SECRET, { expiresIn: -1 }))).toBeNull();
    expect(verifyAdmin(jwt.sign({ type: 'admin', role: 'admin' }, ADMIN_SECRET, { algorithm: 'HS384' }))).toBeNull();
  });

  it('fails closed when the production JWT secret is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_JWT_SECRET', '');
    expect(() => signAdmin({})).toThrow('ADMIN_JWT_SECRET');
  });

  it('fails closed when the production JWT secret is weak', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_JWT_SECRET', 'replace-me-with-a-production-admin-jwt-credential');
    expect(() => signAdmin({})).toThrow('ADMIN_JWT_SECRET');
  });

  it('creates a bounded server-side admin session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    prismaMock.adminSession.create.mockResolvedValue({});
    const result = await createAdminSession();
    expect(result.loginAt).toBe(1_893_456_000);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(prismaMock.adminSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: result.id,
      expiresAt: new Date('2030-01-01T02:00:00Z'),
      absoluteExpiresAt: new Date('2030-01-02T00:00:00Z'),
    }) });
  });

  it('requires a live database session in addition to a valid JWT', async () => {
    const token = signAdmin({ session_id: 'session-1' });
    prismaMock.adminSession.findUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
    });
    await expect(verifyAdminSession(token)).resolves.toEqual(expect.objectContaining({ session_id: 'session-1' }));
    prismaMock.adminSession.findUnique.mockResolvedValue(null);
    await expect(verifyAdminSession(token)).resolves.toBeNull();
    await expect(verifyAdminSession(signAdmin({}))).resolves.toBeNull();
  });

  it('refreshes only active sessions and caps expiry at the absolute deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
    prismaMock.adminSession.findUnique.mockResolvedValue({
      revokedAt: null,
      absoluteExpiresAt: new Date('2030-01-01T13:00:00Z'),
    });
    prismaMock.adminSession.update.mockResolvedValue({});
    await expect(refreshAdminSession('session-1')).resolves.toEqual(new Date('2030-01-01T13:00:00Z'));
    expect(prismaMock.adminSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { expiresAt: new Date('2030-01-01T13:00:00Z') },
    });
    prismaMock.adminSession.findUnique.mockResolvedValue({ revokedAt: new Date(), absoluteExpiresAt: new Date('2030-01-02') });
    await expect(refreshAdminSession('session-1')).resolves.toBeNull();
  });

  it('revokes idempotently and skips missing session ids', async () => {
    prismaMock.adminSession.updateMany.mockResolvedValue({ count: 1 });
    await revokeAdminSession(undefined);
    expect(prismaMock.adminSession.updateMany).not.toHaveBeenCalled();
    await revokeAdminSession('session-1');
    expect(prismaMock.adminSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('guest authentication', () => {
  beforeEach(() => {
    vi.stubEnv('GUEST_JWT_SECRET', GUEST_SECRET);
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('parses only valid HS256 guest tokens', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const token = jwt.sign({
      type: 'guest', sid: 'session-1', user: { id: 'user-1' }, booking: { id: 'booking-1' },
    }, GUEST_SECRET, { algorithm: 'HS256', expiresIn: '2h' });
    expect(parseGuestSession(token)).toEqual(expect.objectContaining({ type: 'guest', sid: 'session-1' }));
    expect(parseGuestSession(null)).toBeNull();
    expect(parseGuestSession('invalid')).toBeNull();
    expect(parseGuestSession(jwt.sign({ type: 'admin' }, GUEST_SECRET))).toBeNull();
    expect(parseGuestSession(jwt.sign({ type: 'guest' }, GUEST_SECRET, { algorithm: 'HS384' }))).toBeNull();
  });

  it('parses an expired signed session only as a refresh binding', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const expired = jwt.sign({
      type: 'guest', sid: 'session-1', user: { id: 'user-1' }, booking: { id: 'booking-1' },
    }, GUEST_SECRET, { algorithm: 'HS256', expiresIn: -1 });
    expect(parseGuestSession(expired)).toBeNull();
    expect(parseGuestSessionBinding(expired)).toEqual({
      status: 'present',
      sessionId: 'session-1',
      userId: 'user-1',
      bookingId: 'booking-1',
    });
    expect(parseGuestSessionBinding(null)).toEqual({ status: 'missing' });
    expect(parseGuestSessionBinding('malformed')).toEqual({ status: 'invalid' });
  });

  it('issues a database-backed guest session and matching JWT', async () => {
    prismaMock.session.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    const token = await issueGuestSession('user-1', 'booking-1');
    expect(prismaMock.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'user-1',
      bookingId: 'booking-1',
      expiresAt: expect.any(Date),
    }) });
    expect(parseGuestSession(token)).toEqual(expect.objectContaining({
      type: 'guest',
      user: { id: 'user-1' },
      booking: { id: 'booking-1' },
    }));
  });

  it('rejects a missing production guest signer before database mutation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GUEST_JWT_SECRET', '');
    await expect(issueGuestSession('user-1', 'booking-1')).rejects.toThrow('GUEST_JWT_SECRET');
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('grants access only when session and verified booking constraints all match', async () => {
    const now = new Date();
    const session = { type: 'guest' as const, sid: 'session-1', user: { id: 'user-1' }, booking: { id: 'booking-1' } };
    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', bookingId: 'booking-1', revokedAt: null, expiresAt: new Date(now.getTime() + 60_000),
    });
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 'booking-1', userId: 'user-1', accessStatus: 'VERIFIED',
      startDate: new Date(now.getTime() - 60_000), endDate: new Date(now.getTime() + 86_400_000),
    });
    await expect(verifyGuestSessionAccess(session)).resolves.toBe(session);
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 'booking-1', userId: 'user-1', accessStatus: 'PENDING', startDate: now, endDate: new Date(now.getTime() + 86_400_000),
    });
    await expect(verifyGuestSessionAccess(session)).resolves.toBeNull();
    await expect(verifyGuestSessionAccess(null)).resolves.toBeNull();
  });

  it('revokes the session authorization chain and ignores payloads without a session id', async () => {
    refreshTokenRepositoryMock.revokeAuthorizationForSession.mockResolvedValue(true);
    await revokeGuestSessionById(undefined);
    expect(refreshTokenRepositoryMock.revokeAuthorizationForSession).not.toHaveBeenCalled();
    await revokeGuestSessionById('session-1');
    expect(refreshTokenRepositoryMock.revokeAuthorizationForSession)
      .toHaveBeenCalledWith('session-1');
  });

  it('uses secure, HTTP-only, same-site cookie policies', () => {
    expect(createSessionCookie('token')).toEqual({
      name: 'guest_session', value: 'token',
      options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 7_200 },
    });
    expect(clearSessionCookie()).toEqual(expect.objectContaining({ name: 'guest_session', value: '', options: expect.objectContaining({ maxAge: 0 }) }));
    expect(createRefreshCookie('refresh', 3)).toEqual({
      name: 'guest_rt', value: 'refresh',
      options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 259_200 },
    });
    expect(clearRefreshCookie()).toEqual(expect.objectContaining({ name: 'guest_rt', value: '', options: expect.objectContaining({ maxAge: 0 }) }));
    vi.stubEnv('NODE_ENV', 'production');
    expect(createSessionCookie('token').options.secure).toBe(true);
    expect(createRefreshCookie('refresh').options.secure).toBe(true);
  });
});
