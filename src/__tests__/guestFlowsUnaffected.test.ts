import { NextRequest } from 'next/server';
import { signGuestSession } from '@/lib/guestSession';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';

type GuestStoreMock = {
  findUserByPhone: ReturnType<typeof vi.fn>;
  findBookingByReferenceAndLastName: ReturnType<typeof vi.fn>;
  findEligibleBookingForUser: ReturnType<typeof vi.fn>;
  issueRefreshToken: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  updateUserPassword: ReturnType<typeof vi.fn>;
  linkUserToBookingWithAccess: ReturnType<typeof vi.fn>;
  findUserById: ReturnType<typeof vi.fn>;
};

type CheckInRequestRepositoryMock = {
  create: ReturnType<typeof vi.fn>;
  findLatestForGuest: ReturnType<typeof vi.fn>;
};

let guestStore: GuestStoreMock;
let checkInRequestRepository: CheckInRequestRepositoryMock;
let bcryptCompare: ReturnType<typeof vi.fn>;
let bcryptHash: ReturnType<typeof vi.fn>;

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

function jsonPost(url: string, body: unknown, cookies?: Record<string, string>) {
  return makeReq(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cookies,
    body: JSON.stringify(body),
  });
}

function mockGuestDependencies() {
  guestStore = {
    findUserByPhone: vi.fn(),
    findBookingByReferenceAndLastName: vi.fn().mockResolvedValue({ id: BOOKING_ID }),
    findEligibleBookingForUser: vi.fn(),
    issueRefreshToken: vi.fn(),
    createUser: vi.fn(),
    updateUserPassword: vi.fn(),
    linkUserToBookingWithAccess: vi.fn(),
    findUserById: vi.fn(),
  };
  checkInRequestRepository = {
    create: vi.fn(),
    findLatestForGuest: vi.fn(),
  };
  bcryptCompare = vi.fn();
  bcryptHash = vi.fn();

  vi.doMock('@/lib/featureFlags', () => ({
    getFeatureFlagsAsync: async () => ({ portalEnabled: true, checkinEnabled: true }),
  }));
  vi.doMock('@/lib/guestDataStore', () => ({
    guestStore,
  }));
  vi.doMock('bcrypt', () => ({
    default: {
      compare: bcryptCompare,
      hash: bcryptHash,
    },
  }));
  vi.doMock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
    checkInRequestRepository,
  }));
  vi.doMock('@/lib/prisma', () => ({
    prisma: {
      session: {
        create: vi.fn(async ({ data }: any) => ({ ...data })),
        findUnique: vi.fn(async () => ({
          id: '44444444-4444-4444-8444-444444444444',
          userId: USER_ID,
          bookingId: BOOKING_ID,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        })),
      },
      access: {
        findUnique: vi.fn(async () => ({
          status: 'VERIFIED',
          booking: { userId: USER_ID, endDate: new Date(Date.now() + 86_400_000) },
        })),
      },
    },
  }));
}

describe('guest auth and arrival request flows remain separate from admin', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GUEST_JWT_SECRET = 'guest-test-secret-with-enough-entropy';
    mockGuestDependencies();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/featureFlags');
    vi.doUnmock('@/lib/guestDataStore');
    vi.doUnmock('bcrypt');
    vi.doUnmock('@/lib/prisma-repositories/checkInRequestRepository');
  });

  it('keeps guest sign-in issuing guest session cookies', async () => {
    guestStore.findUserByPhone.mockResolvedValue({
      id: USER_ID,
      phone_e164: '+306900000001',
      password_hash: 'stored-password-hash',
      country_origin: 'ABROAD',
    });
    guestStore.findEligibleBookingForUser.mockResolvedValue({
      id: BOOKING_ID,
      source: 'ONSITE',
      reference: 'BOOK-1',
    });
    bcryptCompare.mockResolvedValue(true);

    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signin',
      phone: '+306900000001',
      password: 'correct-password',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.redirect).toBe('/en/check-in');
    expect(res.headers.get('set-cookie')).toContain('guest_session=');
    expect(res.headers.get('set-cookie')).toContain('portal_last_signin=1');
    expect(guestStore.findEligibleBookingForUser).toHaveBeenCalledWith(USER_ID);
  });

  it('keeps guest sign-up linking a booking and issuing a guest session', async () => {
    guestStore.findUserByPhone.mockResolvedValue(null);
    guestStore.createUser.mockResolvedValue({
      id: USER_ID,
      phone_e164: '+306900000002',
      password_hash: 'new-password-hash',
      country_origin: 'ABROAD',
    });
    guestStore.linkUserToBookingWithAccess.mockResolvedValue({
      userId: USER_ID,
      booking: {
        id: BOOKING_ID,
        source: 'EXTERNAL',
        reference: 'BOOK-2',
      },
    });
    bcryptHash.mockResolvedValue('new-password-hash');

    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'ABROAD',
      phone: '+306900000002',
      password: 'new-password',
      passport: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.bookingId).toBe(BOOKING_ID);
    expect(res.headers.get('set-cookie')).toContain('guest_session=');
    expect(guestStore.linkUserToBookingWithAccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: undefined,
      newUser: {
        phoneE164: '+306900000002',
        countryOrigin: 'ABROAD',
        passwordHash: 'new-password-hash',
      },
      origin: 'ABROAD',
      identityValue: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
    }));
  });

  it('rejects sign-up without a password before touching account data', async () => {
    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'ABROAD',
      phone: '+306900000002',
      passport: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(422);
    expect(guestStore.findUserByPhone).not.toHaveBeenCalled();
    expect(guestStore.linkUserToBookingWithAccess).not.toHaveBeenCalled();
  });

  it('rejects existing sign-up accounts that do not have a password hash', async () => {
    guestStore.findUserByPhone.mockResolvedValue({
      id: USER_ID,
      phone_e164: '+306900000002',
      country_origin: 'ABROAD',
    });

    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'ABROAD',
      phone: '+306900000002',
      password: 'new-password',
      passport: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(401);
    expect(guestStore.linkUserToBookingWithAccess).not.toHaveBeenCalled();
  });

  it('rejects existing sign-up accounts when the password is wrong', async () => {
    guestStore.findUserByPhone.mockResolvedValue({
      id: USER_ID,
      phone_e164: '+306900000002',
      password_hash: 'stored-password-hash',
      country_origin: 'ABROAD',
    });
    bcryptCompare.mockResolvedValue(false);

    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'ABROAD',
      phone: '+306900000002',
      password: 'wrong-password',
      passport: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(401);
    expect(bcryptCompare).toHaveBeenCalledWith('wrong-password', 'stored-password-hash');
    expect(guestStore.linkUserToBookingWithAccess).not.toHaveBeenCalled();
  });

  it('allows existing sign-up accounts only after password verification', async () => {
    guestStore.findUserByPhone.mockResolvedValue({
      id: USER_ID,
      phone_e164: '+306900000002',
      password_hash: 'stored-password-hash',
      country_origin: 'ABROAD',
    });
    guestStore.linkUserToBookingWithAccess.mockResolvedValue({
      userId: USER_ID,
      booking: {
        id: BOOKING_ID,
        source: 'EXTERNAL',
        reference: 'BOOK-2',
      },
    });
    bcryptCompare.mockResolvedValue(true);

    const { POST } = await import('@/app/api/portal/verify/route');
    const res = await POST(jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'ABROAD',
      phone: '+306900000002',
      password: 'correct-password',
      passport: 'AB12345',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      remember: false,
    }) as any, { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(200);
    expect(bcryptCompare).toHaveBeenCalledWith('correct-password', 'stored-password-hash');
    expect(guestStore.linkUserToBookingWithAccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      lastName: 'Guest',
    }));
  });

  it('keeps guest arrival request creation on guest_session auth only', async () => {
    const token = signGuestSession({
      sid: '44444444-4444-4444-8444-444444444444',
      user: { id: USER_ID },
      booking: { id: BOOKING_ID },
    });
    guestStore.findUserById.mockResolvedValue({
      id: USER_ID,
      email: 'guest@example.com',
      phone_e164: '+306900000003',
    });
    checkInRequestRepository.create.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      booking_id: BOOKING_ID,
      user_id: USER_ID,
      guest_email: 'guest@example.com',
      guest_phone: '+306900000003',
      requested_time: '12:30',
      message: 'Early arrival',
      status: 'PENDING',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const { POST } = await import('@/app/api/check-in/arrival-request/route');
    const res = await POST(jsonPost('/api/check-in/arrival-request', {
      requestedTime: '12:30',
      message: 'Early arrival',
    }, {
      guest_session: token,
    }) as any, { params: Promise.resolve({}) } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.request).toMatchObject({
      requestedTime: '12:30',
      status: 'pending',
    });
    expect(checkInRequestRepository.create).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      userId: USER_ID,
      guestEmail: 'guest@example.com',
      guestPhone: '+306900000003',
      requestedTime: '12:30',
      message: 'Early arrival',
    });
  });
});
