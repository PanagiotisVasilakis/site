import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking, User } from '@/lib/guestDataStore';

const m = vi.hoisted(() => ({
  bookingGetAll: vi.fn(),
  userGetAll: vi.fn(),
  userFindByPhone: vi.fn(),
  bookingAggregate: vi.fn(),
  userAggregate: vi.fn(),
}));

// The dataset aggregate (row count and latest updatedAt) never changes in these
// tests, as when a row is edited or replaced within the same timestamp. A cache
// keyed on it would keep serving the first rows it loaded.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { aggregate: m.bookingAggregate },
    user: { aggregate: m.userAggregate },
  },
}));
vi.mock('@/lib/prisma-repositories/bookingRepository', () => ({ bookingRepository: { getAll: m.bookingGetAll } }));
vi.mock('@/lib/prisma-repositories/userRepository', () => ({
  userRepository: { getAll: m.userGetAll, findByPhone: m.userFindByPhone },
}));
vi.mock('@/lib/prisma-repositories/refreshTokenRepository', () => ({ refreshTokenRepository: {} }));
vi.mock('@/lib/guestSession', () => ({ createGuestSessionToken: vi.fn(), GUEST_SESSION_TTL_SECONDS: 60 }));
vi.mock('@/lib/crypto', () => ({ hashSensitive: vi.fn() }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { guestStore } from '@/lib/guestDataStore';

const updatedAt = new Date('2030-07-14T12:00:00Z');

function booking(id: string): Booking {
  return {
    id,
    source: 'EXTERNAL',
    startDate: new Date('2030-07-20T00:00:00Z'),
    endDate: new Date('2030-07-22T00:00:00Z'),
    userId: null,
    provider: 'test',
    externalReference: null,
    accessStatus: 'PENDING',
    claimedAt: null,
    createdAt: new Date(0),
  };
}

function user(id: string): User {
  return {
    id,
    phoneE164: '+306900000000',
    createdAt: new Date(0),
    updatedAt,
  };
}

beforeEach(() => {
  m.bookingAggregate.mockResolvedValue({ _count: { _all: 1 }, _max: { updatedAt } });
  m.userAggregate.mockResolvedValue({ _count: { _all: 1 }, _max: { updatedAt } });
});

describe('guestStore admin reads', () => {
  it('returns the current bookings on every call', async () => {
    m.bookingGetAll.mockResolvedValueOnce([booking('first')]).mockResolvedValueOnce([booking('second')]);

    expect(await guestStore.getAllBookings()).toEqual([booking('first')]);
    expect(await guestStore.getAllBookings()).toEqual([booking('second')]);
    expect(m.bookingGetAll).toHaveBeenCalledTimes(2);
  });

  it('returns the current users on every call', async () => {
    m.userGetAll.mockResolvedValueOnce([user('first')]).mockResolvedValueOnce([user('second')]);

    expect(await guestStore.getAllUsers()).toEqual([user('first')]);
    expect(await guestStore.getAllUsers()).toEqual([user('second')]);
    expect(m.userGetAll).toHaveBeenCalledTimes(2);
  });
});

describe('guestStore.findUserByPhone', () => {
  it('finds a guest stored with +30 when the host types the Greek local form', async () => {
    const guest = user('local');
    m.userFindByPhone.mockImplementation(async (phone: string) => (phone === '+306912345678' ? guest : undefined));

    expect(await guestStore.findUserByPhone('691 234 5678')).toEqual(guest);
    expect(m.userFindByPhone.mock.calls).toEqual([['+6912345678'], ['+306912345678']]);
  });

  it('looks up the +30 form once', async () => {
    const guest = user('international');
    m.userFindByPhone.mockResolvedValue(guest);

    expect(await guestStore.findUserByPhone('+306912345678')).toEqual(guest);
    expect(m.userFindByPhone.mock.calls).toEqual([['+306912345678']]);
  });

  it('does not repeat the +30 lookup when no guest has that number', async () => {
    m.userFindByPhone.mockResolvedValue(undefined);

    expect(await guestStore.findUserByPhone('+306912345678')).toBeUndefined();
    expect(m.userFindByPhone.mock.calls).toEqual([['+306912345678']]);
  });

  it('keeps the international reading first for 10 digits without +', async () => {
    const guest = user('abroad');
    m.userFindByPhone.mockImplementation(async (phone: string) => (phone === '+4917123456' ? guest : undefined));

    expect(await guestStore.findUserByPhone('4917123456')).toEqual(guest);
    expect(m.userFindByPhone.mock.calls).toEqual([['+4917123456']]);
  });
});
