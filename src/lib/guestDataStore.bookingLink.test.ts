const { prismaMock, tx } = vi.hoisted(() => {
  const transactionClient = {
    identity: {
      upsert: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    booking: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    access: {
      upsert: vi.fn(),
    },
    onsiteGrant: {
      create: vi.fn(),
    },
  };

  return {
    tx: transactionClient,
    prismaMock: {
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => (
        callback(transactionClient)
      )),
      booking: {
        update: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger-enterprise', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getContext: vi.fn(() => undefined),
  },
}));
vi.mock('@/lib/guestDataCache', () => ({
  guestDataCache: {
    invalidate: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('@/lib/crypto', () => ({
  hashSensitive: vi.fn((value: string) => ({ hash: `hash:${value}`, salt: `salt:${value}` })),
  maskLast4: vi.fn((value: string) => value.slice(-4).padStart(value.length, '*')),
  hmacDeterministic: vi.fn((value: string) => `hmac:${value}`),
}));

import { BookingAlreadyLinkedError, guestStore } from './guestDataStore';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';

function bookingDb(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    source: 'EXTERNAL',
    reference: 'ABC123',
    lastNameHash: 'hash',
    lastNameSalt: 'salt',
    lastNameToken: 'hmac:guest',
    lastNameTokenNoWs: 'hmac:guest',
    startDate: new Date('2026-07-10T00:00:00.000Z'),
    endDate: new Date('2026-07-12T00:00:00.000Z'),
    userId: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

function accessDb() {
  return {
    userId: USER_ID,
    bookingId: BOOKING_ID,
    status: 'VERIFIED',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
  };
}

function userDb() {
  return {
    id: USER_ID,
    email: null,
    phoneE164: '+306900000002',
    passwordHash: null,
    countryOrigin: 'GR',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

describe('guestStore booking linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.identity.upsert.mockResolvedValue({});
    tx.access.upsert.mockResolvedValue(accessDb());
    tx.user.findFirst.mockResolvedValue(userDb());
    tx.user.findUnique.mockResolvedValue(userDb());
    tx.user.upsert.mockResolvedValue(userDb());
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.onsiteGrant.create.mockResolvedValue({});
  });

  it('claims an existing unclaimed booking before granting access', async () => {
    const existing = bookingDb();
    const claimed = bookingDb({ userId: USER_ID });
    tx.booking.findFirst.mockResolvedValue(existing);
    tx.booking.findUnique.mockResolvedValueOnce(claimed);

    const result = await guestStore.linkUserToBookingWithAccess({
      userId: USER_ID,
      origin: 'GR',
      identityValue: '123456789',
      bookingRef: 'ABC123',
      lastName: 'Guest',
    });

    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, userId: null },
      data: { userId: USER_ID },
    });
    expect(tx.access.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: USER_ID, bookingId: BOOKING_ID }),
    }));
    expect(result.booking.user_id).toBe(USER_ID);
  });

  it('rejects an existing booking claimed by another user', async () => {
    tx.booking.findFirst.mockResolvedValue(bookingDb({ userId: OTHER_USER_ID }));

    await expect(guestStore.linkUserToBookingWithAccess({
      userId: USER_ID,
      origin: 'GR',
      identityValue: '123456789',
      bookingRef: 'ABC123',
      lastName: 'Guest',
    })).rejects.toBeInstanceOf(BookingAlreadyLinkedError);

    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.access.upsert).not.toHaveBeenCalled();
  });

  it('uses the same claim policy for onsite registration', async () => {
    const existing = bookingDb({ source: 'ONSITE' });
    const claimed = bookingDb({ source: 'ONSITE', userId: USER_ID });
    tx.booking.findUnique.mockResolvedValueOnce(existing).mockResolvedValueOnce(claimed);

    const result = await guestStore.registerOnsiteGuest({
      phone: '+306900000002',
      origin: 'GR',
      bookingId: BOOKING_ID,
      grant: {
        jti: '44444444-4444-4444-8444-444444444444',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, userId: null },
      data: { userId: USER_ID },
    });
    expect(result.booking.user_id).toBe(USER_ID);
  });
});
