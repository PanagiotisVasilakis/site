import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  prismaUserFindUnique: vi.fn(),
  prismaBookingFindMany: vi.fn(),
  repoFindByPhone: vi.fn(),
  bcryptCompare: vi.fn(),
}));

vi.mock('bcrypt', () => ({ default: { compare: m.bcryptCompare, hash: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: m.prismaUserFindUnique },
    booking: { findMany: m.prismaBookingFindMany },
  },
}));
vi.mock('@/lib/prisma-repositories/userRepository', () => ({ userRepository: { findByPhone: m.repoFindByPhone } }));
vi.mock('@/lib/prisma-repositories/bookingRepository', () => ({ bookingRepository: {} }));
vi.mock('@/lib/prisma-repositories/refreshTokenRepository', () => ({ refreshTokenRepository: {} }));
vi.mock('@/lib/guestSession', () => ({ createGuestSessionToken: vi.fn(), GUEST_SESSION_TTL_SECONDS: 60 }));
vi.mock('@/lib/crypto', () => ({ hashSensitive: vi.fn() }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { guestStore } from '@/lib/guestDataStore';
import { authenticatePortalUser, PortalAuthError } from '@/lib/portalAuthService';

const account = {
  id: 'user-1',
  email: null,
  phoneE164: '',
  countryOrigin: 'GR',
  passwordHash: 'stored-hash',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function storeAccountAt(phoneE164: string) {
  const stored = { ...account, phoneE164 };
  m.repoFindByPhone.mockImplementation(async (phone: string) => (phone === phoneE164 ? stored : undefined));
  m.prismaUserFindUnique.mockImplementation(async ({ where }: { where: { phoneE164: string } }) => (
    where.phoneE164 === phoneE164 ? stored : null
  ));
}

/** Resolves the input through sign-in; the account id, or null when sign-in found no account. */
async function signInResolves(phone: string): Promise<string | null> {
  try {
    await authenticatePortalUser({ phone, password: 'secret' });
    throw new Error('sign-in unexpectedly succeeded without an eligible booking');
  } catch (error) {
    if (!(error instanceof PortalAuthError)) throw error;
    // An account was resolved and its password matched: only the booking check failed.
    if (error.code === 'NO_ELIGIBLE_BOOKING') return account.id;
    if (error.code === 'INVALID_CREDENTIALS') return null;
    throw error;
  }
}

async function adminResolves(phone: string): Promise<string | null> {
  return (await guestStore.findUserByPhone(phone))?.id ?? null;
}

beforeEach(() => {
  m.bcryptCompare.mockResolvedValue(true);
  m.prismaBookingFindMany.mockResolvedValue([]);
});

describe('admin phone search and guest sign-in resolve the same accounts', () => {
  it.each([
    ['Greek local form of a +30 account', '691 234 5678', '+306912345678', true],
    ['international form of a +30 account', '+306912345678', '+306912345678', true],
    ['10 digits without + stored internationally', '4917123456', '+4917123456', true],
    ['10 digits starting with 0 (invalid international reading)', '0123456789', '+300123456789', false],
    ['unparseable input', 'not a phone', '+306912345678', false],
  ])('%s', async (_label, input, stored, found) => {
    storeAccountAt(stored);

    const admin = await adminResolves(input);
    const signIn = await signInResolves(input);

    expect(admin).toBe(signIn);
    expect(admin).toBe(found ? account.id : null);
  });

  it('tries the same phone numbers in the same order', async () => {
    for (const input of ['691 234 5678', '+306912345678', '4917123456', '0123456789', 'not a phone']) {
      m.repoFindByPhone.mockReset().mockResolvedValue(undefined);
      m.prismaUserFindUnique.mockReset().mockResolvedValue(null);

      await adminResolves(input);
      await signInResolves(input);

      const adminLookups = m.repoFindByPhone.mock.calls.map(([phone]) => phone);
      const signInLookups = m.prismaUserFindUnique.mock.calls.map(([args]) => args.where.phoneE164);
      expect(adminLookups, input).toEqual(signInLookups);
    }
  });
});
