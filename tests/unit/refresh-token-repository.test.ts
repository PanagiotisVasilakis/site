import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), getContext: vi.fn() }));

vi.mock('@/lib/logger-enterprise', () => ({ logger }));
// The module builds its default repository from the shared client; these tests pass their own.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { hashSensitive } from '@/lib/crypto';
import { createRefreshTokenRepository } from '@/lib/prisma-repositories/refreshTokenRepository';

type Replacement = Parameters<ReturnType<typeof createRefreshTokenRepository>['rotate']>[1];
type Row = Record<string, unknown>;

const NOW = new Date('2030-07-10T12:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2030, 6, 10 + offset));
const TOKEN_ID = '9a000000-0000-4000-8000-000000000001';
const NEW_ID = '9a000000-0000-4000-8000-000000000002';
const FAMILY_ID = '9a000000-0000-4000-8000-000000000003';
const USER_ID = '9a000000-0000-4000-8000-000000000004';
const BOOKING_ID = '9a000000-0000-4000-8000-000000000005';
const OTHER_ID = '9a000000-0000-4000-8000-000000000006';
const DEVICE_HASH = 'd'.repeat(64);
const SECRET = 'refresh-secret-presented-by-the-guest';
const STORED = hashSensitive(SECRET);
const COMPOSITE = `${TOKEN_ID}.${SECRET}`;

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1_000);

// A fake database that is also its own transaction client. Row locks are always granted and the
// advisory try-lock is granted unless the test turns it off, so each test decides only which rows
// the repository finds and which writes it makes.
function arrange(rows: {
  token?: Row;
  family?: Row;
  session?: Row | null;
  booking?: Row | null;
  advisoryLock?: boolean;
  userLock?: boolean;
  familyLock?: boolean;
} = {}) {
  const db = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('pg_try_advisory_xact_lock')) return [{ acquired: rows.advisoryLock ?? true }];
      if (sql.includes('"users"')) return (rows.userLock ?? true) ? [{ id: USER_ID }] : [];
      return (rows.familyLock ?? true) ? [{ id: FAMILY_ID }] : [];
    }),
    $executeRaw: vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>>(async () => 1),
    $transaction: vi.fn(),
    refreshToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    refreshTokenFamily: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    session: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    booking: { findUnique: vi.fn() },
    securityAuditEvent: { create: vi.fn() },
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  const family = {
    id: FAMILY_ID,
    userId: USER_ID,
    deviceHash: DEVICE_HASH,
    revokedAt: null,
    absoluteExpiresAt: day(25),
    ...rows.family,
  };
  db.refreshToken.findUnique.mockResolvedValue({
    id: TOKEN_ID,
    userId: USER_ID,
    tokenHash: STORED.hash,
    salt: STORED.salt,
    familyId: FAMILY_ID,
    createdAt: day(-1),
    expiresAt: day(6),
    revokedAt: null,
    rotatedFromId: null,
    lastUsedAt: null,
    ...rows.token,
    family,
  });
  db.refreshTokenFamily.findUnique.mockResolvedValue(family);
  db.session.findUnique.mockResolvedValue(rows.session === null
    ? null
    : { id: TOKEN_ID, userId: USER_ID, bookingId: BOOKING_ID, expiresAt: day(1), revokedAt: null, ...rows.session });
  db.booking.findUnique.mockResolvedValue(rows.booking === null
    ? null
    : { id: BOOKING_ID, userId: USER_ID, accessStatus: 'VERIFIED', startDate: day(-1), endDate: day(3), ...rows.booking });
  db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  db.refreshTokenFamily.updateMany.mockResolvedValue({ count: 1 });
  db.session.updateMany.mockResolvedValue({ count: 1 });
  db.session.create.mockImplementation(async ({ data }: { data: Row }) => ({ ...data }));
  db.refreshToken.create.mockImplementation(async ({ data }: { data: Row }) => ({
    ...data,
    createdAt: NOW,
    revokedAt: null,
    lastUsedAt: null,
    rotatedFromId: data.rotatedFromId ?? null,
  }));
  return db;
}

function replacement(overrides: Partial<Replacement> = {}) {
  return {
    id: NEW_ID,
    tokenHash: 'b'.repeat(64),
    salt: 'c'.repeat(32),
    tokenExpiresAt: day(7).getTime(),
    sessionExpiresAt: day(2),
    deviceHash: DEVICE_HASH,
    presentedSession: { status: 'missing' },
    createSessionToken: vi.fn(() => 'signed-session-token'),
    ...overrides,
  } satisfies Replacement;
}

const repository = (db: ReturnType<typeof arrange>) => createRefreshTokenRepository(db as unknown as PrismaClient);

function rotate(db: ReturnType<typeof arrange>, token = COMPOSITE, next: Replacement = replacement()) {
  return repository(db).rotate(token, next);
}

const sessionRevocations = (db: ReturnType<typeof arrange>) => (
  db.$executeRaw.mock.calls.filter(([strings]) => strings.join('?').includes('UPDATE "sessions"'))
);

function expectFamilyRevoked(db: ReturnType<typeof arrange>, reason: string) {
  expect(db.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
    where: { id: FAMILY_ID, revokedAt: null },
    data: { revokedAt: NOW, revocationReason: reason },
  });
  expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
    where: { familyId: FAMILY_ID, revokedAt: null },
    data: { revokedAt: NOW },
  });
  // The sessions of every generation of the family are revoked with it.
  expect(sessionRevocations(db)).toHaveLength(1);
  expect(sessionRevocations(db)[0].slice(1)).toEqual([NOW, FAMILY_ID]);
}

function expectNothingRevokedOrIssued(db: ReturnType<typeof arrange>) {
  expect(db.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
  expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  expect(db.session.updateMany).not.toHaveBeenCalled();
  expect(sessionRevocations(db)).toEqual([]);
  expectNothingIssued(db);
}

function expectNothingIssued(db: ReturnType<typeof arrange>) {
  expect(db.session.create).not.toHaveBeenCalled();
  expect(db.refreshToken.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('refresh token rotation', () => {
  it('retires the presented generation and issues the next one inside the same family and booking', async () => {
    const db = arrange();
    const next = replacement({ presentedSession: { status: 'present', sessionId: TOKEN_ID, userId: USER_ID, bookingId: BOOKING_ID } });

    const result = await rotate(db, COMPOSITE, next);

    expect(result).toMatchObject({
      status: 'rotated',
      old: { id: TOKEN_ID, revoked_at: NOW.getTime(), last_used_at: NOW.getTime() },
      rec: { id: NEW_ID, user_id: USER_ID, family_id: FAMILY_ID, rotated_from_id: TOKEN_ID },
      session: { id: NEW_ID, userId: USER_ID, bookingId: BOOKING_ID, expiresAt: day(2) },
      sessionToken: 'signed-session-token',
    });
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: TOKEN_ID, revokedAt: null, expiresAt: { gt: NOW } },
      data: { revokedAt: NOW, lastUsedAt: NOW },
    });
    expect(db.session.updateMany).toHaveBeenCalledWith({ where: { id: TOKEN_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(db.session.create).toHaveBeenCalledWith({ data: { id: NEW_ID, userId: USER_ID, bookingId: BOOKING_ID, expiresAt: day(2) } });
    expect(db.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
    expect(db.securityAuditEvent.create).not.toHaveBeenCalled();
    expect(next.createSessionToken).toHaveBeenCalledExactlyOnceWith({ id: NEW_ID, userId: USER_ID, bookingId: BOOKING_ID, expiresAt: day(2) });
  });

  it('never lets the new generation outlive the absolute expiry of its family', async () => {
    const db = arrange({ family: { absoluteExpiresAt: day(3) } });

    await expect(rotate(db)).resolves.toMatchObject({ status: 'rotated' });

    expect(db.refreshToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: NEW_ID, expiresAt: day(3), rotatedFromId: TOKEN_ID }) });
  });

  it('revokes the whole family and records a theft signal when an already rotated token is replayed', async () => {
    const db = arrange({ token: { revokedAt: secondsFromNow(-60) } });
    logger.getContext.mockReturnValue({ correlationId: 'corr-replay-1' });
    const next = replacement();

    await expect(rotate(db, COMPOSITE, next)).resolves.toEqual({ status: 'replayed', familyId: FAMILY_ID });

    expectFamilyRevoked(db, 'refresh_token_replay');
    expect(db.securityAuditEvent.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        id: expect.any(String),
        eventType: 'portal.refresh_token_replay',
        severity: 'high',
        correlationId: 'corr-replay-1',
        path: '/api/portal/refresh',
        details: { reason: 'refresh_token_replay', familyId: FAMILY_ID },
      },
    });
    // The audit record carries neither the presented secret nor the guest.
    expect(JSON.stringify(db.securityAuditEvent.create.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(db.securityAuditEvent.create.mock.calls)).not.toContain(USER_ID);
    expect(logger.warn).toHaveBeenCalledWith('Refresh token replay detected; family revoked', { tokenId: TOKEN_ID, familyId: FAMILY_ID });
    expectNothingIssued(db);
    expect(next.createSessionToken).not.toHaveBeenCalled();
  });

  it('writes the theft signal without a correlation id when the request has none', async () => {
    const db = arrange({ token: { revokedAt: secondsFromNow(-60) } });

    await rotate(db);

    expect(db.securityAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ correlationId: null }) });
  });

  it.each([
    ['another session id', { status: 'present', sessionId: OTHER_ID, userId: USER_ID, bookingId: BOOKING_ID }],
    ['another user', { status: 'present', sessionId: TOKEN_ID, userId: OTHER_ID, bookingId: BOOKING_ID }],
    ['another booking', { status: 'present', sessionId: TOKEN_ID, userId: USER_ID, bookingId: OTHER_ID }],
    ['a session assertion that does not verify', { status: 'invalid' }],
  ] as const)('revokes the family when the session cookie names %s', async (_label, presentedSession) => {
    const db = arrange();
    const next = replacement({ presentedSession });

    await expect(rotate(db, COMPOSITE, next)).resolves.toEqual({ status: 'invalid' });

    expectFamilyRevoked(db, 'session_binding_mismatch');
    expectNothingIssued(db);
    expect(next.createSessionToken).not.toHaveBeenCalled();
  });

  it.each([
    ['one second ago', secondsFromNow(-1)],
    ['at this very instant', NOW],
  ])('refuses a token that expired %s without revoking anything', async (_label, expiresAt) => {
    const db = arrange({ token: { expiresAt } });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectNothingRevokedOrIssued(db);
  });

  it.each([
    ['one second ago', secondsFromNow(-1)],
    ['at this very instant', NOW],
  ])('refuses a token whose family reached its absolute expiry %s without revoking anything', async (_label, absoluteExpiresAt) => {
    const db = arrange({ family: { absoluteExpiresAt } });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectNothingRevokedOrIssued(db);
  });

  it.each([
    ['a stay that ended yesterday', { startDate: day(-4), endDate: day(-1) }],
    ['a check-in more than 7 days away', { startDate: day(8), endDate: day(12) }],
    ['a booking that now belongs to another guest', { userId: OTHER_ID }],
    ['a booking whose access is no longer verified', { accessStatus: 'PENDING' }],
    ['a booking that was deleted', null],
  ] as const)('revokes the family when the booking is no longer eligible: %s', async (_label, booking) => {
    const db = arrange({ booking });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectFamilyRevoked(db, 'booking_ineligible');
    expectNothingIssued(db);
  });

  it.each([
    ['the last day of the stay', { startDate: day(-3), endDate: day(0) }],
    ['the 7th day before check-in', { startDate: day(7), endDate: day(10) }],
  ])('still rotates on %s', async (_label, booking) => {
    const db = arrange({ booking });

    await expect(rotate(db)).resolves.toMatchObject({ status: 'rotated' });
  });

  it('revokes a family that was already revoked and reports the token as invalid', async () => {
    const db = arrange({ family: { revokedAt: secondsFromNow(-60) } });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectFamilyRevoked(db, 'authorization_chain_revoked');
    expectNothingIssued(db);
  });

  it.each([
    ['no session row', null],
    ['the session row of another user', { userId: OTHER_ID }],
  ] as const)('revokes a generation without a session bound to its owner: %s', async (_label, session) => {
    const db = arrange({ session });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectFamilyRevoked(db, 'unbound_refresh_token');
    expectNothingIssued(db);
  });

  it('revokes the family when the session of the generation was revoked', async () => {
    const db = arrange({ session: { revokedAt: secondsFromNow(-60) } });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expectFamilyRevoked(db, 'session_revoked');
    expectNothingIssued(db);
  });

  it.each([
    ['token', () => ({ refreshToken: { count: 0 }, session: { count: 1 } })],
    ['session', () => ({ refreshToken: { count: 1 }, session: { count: 0 } })],
  ] as const)('treats a lost race for the %s as a replay and revokes the family', async (_label, counts) => {
    const db = arrange();
    const { refreshToken, session } = counts();
    db.refreshToken.updateMany.mockResolvedValue(refreshToken);
    db.session.updateMany.mockResolvedValue(session);

    await expect(rotate(db)).resolves.toEqual({ status: 'replayed', familyId: FAMILY_ID });

    expectFamilyRevoked(db, 'authorization_race');
    expectNothingIssued(db);
  });

  it('rejects a token with a wrong secret, an unknown id or a malformed shape before any transaction', async () => {
    const db = arrange();

    await expect(rotate(db, `${TOKEN_ID}.not-the-secret`)).resolves.toEqual({ status: 'invalid' });
    await expect(rotate(db, 'not-a-composite-token')).resolves.toEqual({ status: 'invalid' });
    await expect(rotate(db, `${TOKEN_ID}.`)).resolves.toEqual({ status: 'invalid' });
    db.refreshToken.findUnique.mockResolvedValue(null);
    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a token whose family belongs to another user before any transaction', async () => {
    const db = arrange({ family: { userId: OTHER_ID } });

    await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  describe('when another request holds the generation', () => {
    it('reports an overlapping refresh of the same device as concurrent and revokes nothing', async () => {
      const db = arrange({ advisoryLock: false });

      await expect(rotate(db)).resolves.toEqual({ status: 'concurrent', familyId: FAMILY_ID });

      expectNothingRevokedOrIssued(db);
      expect(db.securityAuditEvent.create).not.toHaveBeenCalled();
    });

    it('treats an overlap from another device as theft: revokes the family and records the signal', async () => {
      const db = arrange({ advisoryLock: false });

      await expect(rotate(db, COMPOSITE, replacement({ deviceHash: 'e'.repeat(64) })))
        .resolves.toEqual({ status: 'replayed', familyId: FAMILY_ID });

      expectFamilyRevoked(db, 'suspicious_refresh_overlap');
      expect(db.securityAuditEvent.create).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({
          eventType: 'portal.refresh_token_replay',
          severity: 'high',
          details: { reason: 'suspicious_refresh_overlap', familyId: FAMILY_ID },
        }),
      });
      expectNothingIssued(db);
    });

    it('treats an overlap without a device hash as theft as well', async () => {
      const db = arrange({ advisoryLock: false });

      await expect(rotate(db, COMPOSITE, replacement({ deviceHash: undefined })))
        .resolves.toEqual({ status: 'replayed', familyId: FAMILY_ID });

      expectFamilyRevoked(db, 'suspicious_refresh_overlap');
    });

    it('rechecks an already retired generation under the user and family locks and treats it as a replay', async () => {
      const db = arrange({ advisoryLock: false, token: { revokedAt: secondsFromNow(-60) } });

      await expect(rotate(db)).resolves.toEqual({ status: 'replayed', familyId: FAMILY_ID });

      expectFamilyRevoked(db, 'refresh_token_replay');
      expect(db.securityAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ details: { reason: 'refresh_token_replay', familyId: FAMILY_ID } }),
      });
      expectNothingIssued(db);
    });

    it('never issues a credential for an expired generation, whatever the recheck finds', async () => {
      const db = arrange({ advisoryLock: false, token: { expiresAt: secondsFromNow(-1) } });

      await expect(rotate(db)).resolves.toEqual({ status: 'invalid' });

      expectNothingRevokedOrIssued(db);
    });
  });

  it('logs and rethrows a database failure instead of answering', async () => {
    const db = arrange();
    const failure = new Error('connection terminated');
    db.$transaction.mockRejectedValue(failure);

    await expect(rotate(db)).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith('refreshTokenRepository(prisma): rotate failed', failure);
  });
});

describe('issuing the first refresh generation', () => {
  const issue = (db: ReturnType<typeof arrange>, expiresAt = day(7).getTime(), options?: { deviceHint?: string; ipHint?: string }) => (
    repository(db).create(USER_ID, TOKEN_ID, STORED.hash, STORED.salt, FAMILY_ID, expiresAt, options)
  );

  function arrangeNewFamily(rows: Parameters<typeof arrange>[0] = {}) {
    const db = arrange(rows);
    db.refreshTokenFamily.findUnique.mockResolvedValue(null);
    db.refreshTokenFamily.create.mockImplementation(async ({ data }: { data: Row }) => ({ ...data }));
    return db;
  }

  it('creates the family and its first token for the session that was just issued', async () => {
    const db = arrangeNewFamily();

    const created = await issue(db, day(7).getTime(), { deviceHint: DEVICE_HASH, ipHint: '203.0.113.7' });

    expect(created).toMatchObject({ id: TOKEN_ID, user_id: USER_ID, family_id: FAMILY_ID, token_hash: STORED.hash, salt: STORED.salt });
    expect(db.refreshTokenFamily.create).toHaveBeenCalledExactlyOnceWith({
      data: { id: FAMILY_ID, userId: USER_ID, absoluteExpiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60_000), deviceHash: DEVICE_HASH },
    });
    expect(db.refreshToken.create).toHaveBeenCalledExactlyOnceWith({
      data: { id: TOKEN_ID, userId: USER_ID, tokenHash: STORED.hash, salt: STORED.salt, familyId: FAMILY_ID, expiresAt: day(7) },
    });
    // Only the device hash is kept; the address hint never reaches the database.
    expect(JSON.stringify([...db.refreshTokenFamily.create.mock.calls, ...db.refreshToken.create.mock.calls])).not.toContain('203.0.113.7');
  });

  it('caps the first token at the absolute lifetime of the family', async () => {
    const db = arrangeNewFamily();

    await issue(db, day(90).getTime());

    expect(db.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60_000) }),
    });
  });

  it.each([
    ['the guest does not exist', { userLock: false }, 'Refresh authorization user does not exist'],
    ['the session does not exist', { session: null }, 'Refresh authorization session is invalid'],
    ['the session belongs to another guest', { session: { userId: OTHER_ID } }, 'Refresh authorization session is invalid'],
    ['the session was revoked', { session: { revokedAt: secondsFromNow(-60) } }, 'Refresh authorization session is invalid'],
    ['the session expires at this very instant', { session: { expiresAt: NOW } }, 'Refresh authorization session is invalid'],
    ['the booking does not exist', { booking: null }, 'Refresh authorization booking is invalid'],
    ['the booking belongs to another guest', { booking: { userId: OTHER_ID } }, 'Refresh authorization booking is invalid'],
    ['the stay ended yesterday', { booking: { startDate: day(-4), endDate: day(-1) } }, 'Refresh authorization booking is invalid'],
  ] as const)('issues nothing when %s', async (_label, rows, message) => {
    const db = arrangeNewFamily(rows);

    await expect(issue(db)).rejects.toThrow(message);

    expect(db.refreshTokenFamily.create).not.toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('refreshTokenRepository(prisma): create failed', expect.objectContaining({ message }));
  });

  it('refuses to reuse the id of an existing family', async () => {
    const db = arrange();

    await expect(issue(db)).rejects.toThrow('Refresh token family already exists');

    expect(db.refreshTokenFamily.create).not.toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('verifying a refresh token', () => {
  it('accepts a live token of an active family and stamps its last use', async () => {
    const db = arrange();

    await expect(repository(db).verify(COMPOSITE)).resolves.toMatchObject({
      id: TOKEN_ID,
      user_id: USER_ID,
      family_id: FAMILY_ID,
      last_used_at: NOW.getTime(),
    });

    expect(db.refreshToken.update).toHaveBeenCalledExactlyOnceWith({ where: { id: TOKEN_ID }, data: { lastUsedAt: NOW } });
  });

  it.each([
    ['a malformed token', 'garbage', {}],
    ['a token without a secret', `${TOKEN_ID}.`, {}],
    ['a wrong secret', `${TOKEN_ID}.not-the-secret`, {}],
    ['a revoked token', COMPOSITE, { token: { revokedAt: secondsFromNow(-60) } }],
    ['a token that expires at this very instant', COMPOSITE, { token: { expiresAt: NOW } }],
    ['a revoked family', COMPOSITE, { family: { revokedAt: secondsFromNow(-60) } }],
    ['a family at its absolute expiry', COMPOSITE, { family: { absoluteExpiresAt: NOW } }],
    ['a token without a session', COMPOSITE, { session: null }],
    ['a token whose session belongs to another guest', COMPOSITE, { session: { userId: OTHER_ID } }],
    ['a token whose session was revoked', COMPOSITE, { session: { revokedAt: secondsFromNow(-60) } }],
  ] as const)('rejects %s without stamping anything', async (_label, token, rows) => {
    const db = arrange(rows);

    await expect(repository(db).verify(token)).resolves.toBeUndefined();

    expect(db.refreshToken.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown token id', async () => {
    const db = arrange();
    db.refreshToken.findUnique.mockResolvedValue(null);

    await expect(repository(db).verify(COMPOSITE)).resolves.toBeUndefined();

    expect(db.session.findUnique).not.toHaveBeenCalled();
    expect(db.refreshToken.update).not.toHaveBeenCalled();
  });

  it('logs and rethrows a database failure instead of answering', async () => {
    const db = arrange();
    const failure = new Error('connection terminated');
    db.refreshToken.findUnique.mockRejectedValue(failure);

    await expect(repository(db).verify(COMPOSITE)).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith('refreshTokenRepository(prisma): verify failed', failure);
  });
});

describe('revoking the authorization of a session', () => {
  const revoke = (db: ReturnType<typeof arrange>, reason?: string) => repository(db).revokeAuthorizationForSession(TOKEN_ID, reason);

  it('revokes the whole family graph of the session, by default as session_revoked', async () => {
    const db = arrange();

    await expect(revoke(db)).resolves.toBe(true);

    expectFamilyRevoked(db, 'session_revoked');
  });

  it('records the reason the caller gives', async () => {
    const db = arrange();

    await expect(revoke(db, 'admin_access_reset')).resolves.toBe(true);

    expectFamilyRevoked(db, 'admin_access_reset');
  });

  it('does nothing for an unknown session', async () => {
    const db = arrange({ session: null });

    await expect(revoke(db)).resolves.toBe(false);

    expectNothingRevokedOrIssued(db);
  });

  it('does nothing when the guest row cannot be locked', async () => {
    const db = arrange({ userLock: false });

    await expect(revoke(db)).resolves.toBe(false);

    expectNothingRevokedOrIssued(db);
  });

  it.each([
    ['a session without a refresh token', {}, true],
    ['a refresh token of another guest', { token: { userId: OTHER_ID } }, false],
    ['a refresh token whose family cannot be locked', { familyLock: false }, false],
  ] as const)('revokes only the session itself for %s', async (_label, rows, withoutToken) => {
    const db = arrange(rows);
    if (withoutToken) db.refreshToken.findUnique.mockResolvedValue(null);

    await expect(revoke(db)).resolves.toBe(true);

    expect(db.session.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: TOKEN_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(db.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['is missing', null],
    ['belongs to another guest', { id: FAMILY_ID, userId: OTHER_ID }],
  ])('revokes the session and its token directly when the family %s', async (_label, family) => {
    const db = arrange();
    db.refreshTokenFamily.findUnique.mockResolvedValue(family);

    await expect(revoke(db)).resolves.toBe(true);

    expect(db.session.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: TOKEN_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(db.refreshToken.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: TOKEN_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(db.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
  });

  it('logs and rethrows a database failure', async () => {
    const db = arrange();
    const failure = new Error('connection terminated');
    db.$transaction.mockRejectedValue(failure);

    await expect(revoke(db)).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith('refreshTokenRepository(prisma): session authorization revoke failed', failure);
  });
});

describe('revoking the family of a refresh token', () => {
  it('revokes the whole family graph, by default as a logout', async () => {
    const db = arrange();

    await expect(repository(db).revokeFamilyForToken(COMPOSITE)).resolves.toBe(true);

    expectFamilyRevoked(db, 'logout');
  });

  it('records the reason the caller gives', async () => {
    const db = arrange();

    await expect(repository(db).revokeFamilyForToken(COMPOSITE, 'password_changed')).resolves.toBe(true);

    expectFamilyRevoked(db, 'password_changed');
  });

  it.each([
    ['a malformed token', 'garbage', {}],
    ['a wrong secret', `${TOKEN_ID}.not-the-secret`, {}],
    ['a token whose family belongs to another guest', COMPOSITE, { family: { userId: OTHER_ID } }],
  ] as const)('revokes nothing for %s and opens no transaction', async (_label, token, rows) => {
    const db = arrange(rows);

    await expect(repository(db).revokeFamilyForToken(token)).resolves.toBe(false);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('revokes nothing for an unknown token', async () => {
    const db = arrange();
    db.refreshToken.findUnique.mockResolvedValue(null);

    await expect(repository(db).revokeFamilyForToken(COMPOSITE)).resolves.toBe(false);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['guest', { userLock: false }],
    ['family', { familyLock: false }],
  ] as const)('revokes nothing when the %s row cannot be locked', async (_label, rows) => {
    const db = arrange(rows);

    await expect(repository(db).revokeFamilyForToken(COMPOSITE)).resolves.toBe(false);

    expect(db.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
    expect(sessionRevocations(db)).toEqual([]);
  });
});
