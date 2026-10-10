import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  bcryptCompare: vi.fn(),
  userFindUnique: vi.fn(),
  bookingFindMany: vi.fn(),
}));

// The point here is how many bcrypt calls a sign-in makes, not how long they take.
vi.mock('bcrypt', () => ({ default: { hash: m.bcryptHash, compare: m.bcryptCompare } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: m.userFindUnique },
    booking: { findMany: m.bookingFindMany },
  },
}));

const NOW = new Date('2030-07-10T15:00:00.000Z');
const PASSWORD = 'a-long-enough-password';
const PHONE = '+306912345678';
const STORED_HASH = `$2b$12$${'s'.repeat(53)}`;
const RANDOM_HASH = `$2b$12$${'r'.repeat(53)}`;

/** A fresh module per test: the random hash is cached for the life of the module. */
async function loadService() {
  vi.resetModules();
  return import('@/lib/portalAuthService');
}

describe('portal sign-in does the same bcrypt work for every phone number', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    m.bcryptHash.mockResolvedValue(RANDOM_HASH);
    m.bcryptCompare.mockResolvedValue(false);
    m.userFindUnique.mockResolvedValue(null);
    m.bookingFindMany.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['an international number', '+306912345678'],
    ['a Greek local number with two lookup candidates', '691 234 5678'],
  ])('compares the password once, against a random hash, for %s that has no account', async (_label, phone) => {
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledWith(PASSWORD, RANDOM_HASH);
    // Same cost factor as the hashes of real passwords, or the compare would be cheaper.
    expect(m.bcryptHash).toHaveBeenCalledWith(expect.any(String), 12);
    expect(m.bookingFindMany).not.toHaveBeenCalled();
  });

  it('compares the password once, against a random hash, for an account without a password', async () => {
    m.userFindUnique.mockResolvedValue({ id: 'user-1', phoneE164: PHONE, passwordHash: null });
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledWith(PASSWORD, RANDOM_HASH);
    expect(m.bookingFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ['no account', null],
    ['an account without a password', { id: 'user-1', phoneE164: PHONE, passwordHash: null }],
  ] as const)('never signs in for %s, even when the comparison against the random hash matches', async (_label, user) => {
    m.userFindUnique.mockResolvedValue(user);
    m.bcryptCompare.mockResolvedValue(true);
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.bookingFindMany).not.toHaveBeenCalled();
  });

  it('creates the random hash once and reuses it for later attempts', async () => {
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
        .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));
    }

    expect(m.bcryptHash).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledTimes(3);
    expect(m.bcryptCompare.mock.calls.map(([, hash]) => hash)).toEqual([RANDOM_HASH, RANDOM_HASH, RANDOM_HASH]);
  });

  it('does not cache a failed hash: the next attempt hashes again and answers INVALID_CREDENTIALS', async () => {
    m.bcryptHash.mockRejectedValueOnce(new Error('bcrypt hash failed'));
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD })).rejects.toThrow('bcrypt hash failed');
    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.bcryptHash).toHaveBeenCalledTimes(2);
    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledWith(PASSWORD, RANDOM_HASH);
  });

  it('compares against the stored hash, without creating the random one, when the account has a password', async () => {
    m.userFindUnique.mockResolvedValue({ id: 'user-1', phoneE164: PHONE, passwordHash: STORED_HASH });
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledWith(PASSWORD, STORED_HASH);
    expect(m.bcryptHash).not.toHaveBeenCalled();
    expect(m.bookingFindMany).not.toHaveBeenCalled();
  });

  it('signs in an account whose password matches, with one comparison against its stored hash', async () => {
    m.userFindUnique.mockResolvedValue({ id: 'user-1', phoneE164: PHONE, passwordHash: STORED_HASH });
    m.bcryptCompare.mockResolvedValue(true);
    m.bookingFindMany.mockResolvedValue([{
      id: 'booking-1',
      userId: 'user-1',
      accessStatus: 'VERIFIED',
      startDate: new Date(Date.UTC(2030, 6, 9)),
      endDate: new Date(Date.UTC(2030, 6, 13)),
    }]);
    const { authenticatePortalUser } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .resolves.toEqual({ userId: 'user-1', bookingId: 'booking-1' });

    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
    expect(m.bcryptCompare).toHaveBeenCalledWith(PASSWORD, STORED_HASH);
    expect(m.bcryptHash).not.toHaveBeenCalled();
  });

  it('keeps answering NO_ELIGIBLE_BOOKING for a matching password without an eligible booking', async () => {
    m.userFindUnique.mockResolvedValue({ id: 'user-1', phoneE164: PHONE, passwordHash: STORED_HASH });
    m.bcryptCompare.mockResolvedValue(true);
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: PHONE, password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('NO_ELIGIBLE_BOOKING'));

    expect(m.bcryptCompare).toHaveBeenCalledTimes(1);
  });

  it('rejects an input without a valid phone reading before any lookup or bcrypt work', async () => {
    const { authenticatePortalUser, PortalAuthError } = await loadService();

    await expect(authenticatePortalUser({ phone: 'not a phone', password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));

    expect(m.userFindUnique).not.toHaveBeenCalled();
    expect(m.bcryptCompare).not.toHaveBeenCalled();
    expect(m.bcryptHash).not.toHaveBeenCalled();
  });
});
