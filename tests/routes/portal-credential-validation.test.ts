import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSensitiveRateLimit: vi.fn(),
  refundSensitiveIdentifierAttempt: vi.fn(),
  authenticatePortalUser: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
  attachPortalAuthCookies: vi.fn(),
  requestAuthContext: vi.fn(),
  readPortalClaimExchange: vi.fn(),
  prismaAccess: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ portalEnabled: true, checkinEnabled: true }) }));
vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: mocks.checkSensitiveRateLimit,
  refundSensitiveIdentifierAttempt: mocks.refundSensitiveIdentifierAttempt,
}));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  authenticatePortalUser: mocks.authenticatePortalUser,
  consumeBookingClaimGrant: mocks.consumeBookingClaimGrant,
}));
vi.mock('@/lib/portalAuthHttp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthHttp')>()),
  attachPortalAuthCookies: mocks.attachPortalAuthCookies,
  requestAuthContext: mocks.requestAuthContext,
}));
vi.mock('@/lib/portalClaimExchange', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalClaimExchange')>()),
  readPortalClaimExchange: mocks.readPortalClaimExchange,
}));
// Neither route may reach the database before its format checks and the limiter: any property access fails the test.
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_target, property) => { mocks.prismaAccess(String(property)); return undefined; } }),
}));

import { POST as claim } from '@/app/api/portal/claims/route';
import { POST as signIn } from '@/app/api/portal/sessions/route';
import { portalTranslations } from '@/i18n/domains/portal';
import { PortalAuthError } from '@/lib/portalAuthService';

const PHONE = '+30 691 234 5678';
const PASSWORD = 'correct horse battery';
const TOKEN_DIGEST = 'a1'.repeat(32);
const CONTEXT = { params: Promise.resolve({}) };
// Every Greek letter is two bytes in UTF-8: 36 of them fill the 72 bytes bcrypt reads, 37 are one letter too many.
const GREEK = 'ΚαλημέραΚαλησπέραΚαληνύχταΕλλάδαΚυπαρισσία';

function post(pathname: string, body: Record<string, unknown>, lang?: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(lang ? { cookie: `lang=${lang}` } : {}) },
    body: JSON.stringify(body),
  });
}

function claimWith(overrides: Record<string, unknown>, lang?: string) {
  return claim(post('/api/portal/claims', {
    origin: 'ABROAD', phone: PHONE, password: PASSWORD, acceptTerms: true, ...overrides,
  }, lang), CONTEXT);
}

function signInWith(overrides: Record<string, unknown>, lang?: string) {
  return signIn(post('/api/portal/sessions', { phone: PHONE, password: PASSWORD, ...overrides }, lang), CONTEXT);
}

async function validationErrors(response: Response): Promise<Array<{ path: string; message: string }>> {
  const body = await response.json();
  expect(body.error.code).toBe('VALIDATION_ERROR');
  return (body.error.details.validationErrors as Array<{ path: string; message: string }>)
    .map(({ path, message }) => ({ path, message }));
}

function expectNothingSpent() {
  expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
  expect(mocks.readPortalClaimExchange).not.toHaveBeenCalled();
  expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  expect(mocks.authenticatePortalUser).not.toHaveBeenCalled();
  expect(mocks.attachPortalAuthCookies).not.toHaveBeenCalled();
  expect(mocks.prismaAccess).not.toHaveBeenCalled();
}

describe('portal claim: phone format and password rules', () => {
  beforeEach(() => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4, resetAt: new Date() });
    mocks.consumeBookingClaimGrant.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
    mocks.requestAuthContext.mockReturnValue({ deviceHint: 'device', ipHint: 'ip', ipHash: 'hash' });
    mocks.readPortalClaimExchange.mockReturnValue(TOKEN_DIGEST);
  });

  it('answers a national-format number with 422 and the country-code hint, before the limiter, the cookie or the database', async () => {
    const response = await claimWith({ phone: '0151 1234567' });

    expect(response.status).toBe(422);
    expect(await validationErrors(response)).toEqual([{ path: 'phone', message: portalTranslations.en.phoneHint }]);
    expectNothingSpent();
  });

  it('words the hint in the language of the page, and says nothing about accounts', async () => {
    const response = await claimWith({ phone: '0151 1234567' }, 'el');

    expect(response.status).toBe(422);
    const [issue] = await validationErrors(response);
    expect(issue.message).toBe(portalTranslations.el.phoneHint);
    expect(issue.message).toContain('+30 69');
    expect(issue.message).not.toMatch(/account|λογαριασμ/iu);
    expectNothingSpent();
  });

  it('keeps the hint identical whatever the number, so it cannot tell registered numbers apart', async () => {
    const hints = new Set<string>();
    for (const phone of ['0151 1234567', '0691234567', 'not a phone', '+30 12345']) {
      const response = await claimWith({ phone });
      expect(response.status).toBe(422);
      hints.add(JSON.stringify(await validationErrors(response)));
    }

    expect(hints.size).toBe(1);
    expectNothingSpent();
  });

  it('reads the Greek ten-digit local number for a Greek origin, as the claim does', async () => {
    const response = await claimWith({ origin: 'GR', phone: '6912345678' });

    expect(response.status).toBe(200);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledWith(expect.objectContaining({ phone: '6912345678', origin: 'GR' }));
  });

  it.each([
    ['a password over 72 bytes', 'Zq7'.repeat(24) + 'x', 'passwordTooLong'],
    ['37 Greek letters, which are 74 bytes', [...GREEK].slice(0, 37).join(''), 'passwordTooLong'],
    ['one character repeated', 'bbbbbbbbbb', 'passwordTooWeak'],
    ['a run of digits', '12345678', 'passwordTooWeak'],
    ['a run of letters', 'abcdefgh', 'passwordTooWeak'],
    ['the phone number itself', '+306912345678', 'passwordTooWeak'],
  ] as const)('answers %s with 422 and a message in both languages, without spending anything', async (_label, password, key) => {
    for (const locale of ['en', 'el'] as const) {
      const response = await claimWith({ password }, locale);

      expect(response.status).toBe(422);
      expect(await validationErrors(response)).toEqual([{ path: 'password', message: portalTranslations[locale].errors[key] }]);
    }
    expectNothingSpent();
  });

  it.each([
    ['72 ASCII bytes', 'Zq7'.repeat(24)],
    ['36 Greek letters, also 72 bytes', [...GREEK].slice(0, 36).join('')],
  ])('accepts exactly %s', async (_label, password) => {
    expect(Buffer.byteLength(password)).toBe(72);

    const response = await claimWith({ password });

    expect(response.status).toBe(200);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledOnce();
  });

  it('reports the phone and the password together', async () => {
    const response = await claimWith({ phone: '01511234567', password: '12345678' });

    expect(response.status).toBe(422);
    expect(await validationErrors(response)).toEqual([
      { path: 'phone', message: portalTranslations.en.phoneHint },
      { path: 'password', message: portalTranslations.en.errors.passwordTooWeak },
    ]);
    expectNothingSpent();
  });

  it('still limits every well-formed attempt exactly as before: on the grant the caller holds, 5 an hour', async () => {
    mocks.consumeBookingClaimGrant.mockRejectedValue(new PortalAuthError('INVALID_CREDENTIALS'));

    const wrongPassword = await claimWith({});

    expect(wrongPassword.status).toBe(401);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { scope: 'portal-claim', identifier: TOKEN_DIGEST, limit: 5, windowMs: 60 * 60_000 },
    );

    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: false, limit: 5, remaining: 0, resetAt: new Date() });
    mocks.consumeBookingClaimGrant.mockClear();

    const limited = await claimWith({});

    expect(limited.status).toBe(429);
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('spends only the address budget of a caller without the exchange cookie, and answers the generic 401', async () => {
    mocks.readPortalClaimExchange.mockReturnValue(null);

    const response = await claimWith({});

    expect(response.status).toBe(401);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { scope: 'portal-claim', identifier: undefined, limit: 5, windowMs: 60 * 60_000 },
    );
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  });
});

describe('portal sign-in: phone format, and no new password rules', () => {
  beforeEach(() => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4, resetAt: new Date() });
    mocks.refundSensitiveIdentifierAttempt.mockResolvedValue(undefined);
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
  });

  it('answers a national-format number with 422 and the hint, before the limiter and the database', async () => {
    const response = await signInWith({ phone: '0151 1234567' }, 'el');

    expect(response.status).toBe(422);
    expect(await validationErrors(response)).toEqual([{ path: 'phone', message: portalTranslations.el.phoneHint }]);
    expectNothingSpent();
    expect(mocks.refundSensitiveIdentifierAttempt).not.toHaveBeenCalled();
  });

  it('keeps accepting the Greek local number, which the lookup reads as +30', async () => {
    const response = await signInWith({ phone: '6912345678' });

    expect(response.status).toBe(200);
    expect(mocks.authenticatePortalUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '6912345678' }));
  });

  it.each([
    ['a 128-character password, the longest ever accepted', 'Zq7'.repeat(42) + 'ab'],
    ['a password of 100 characters, which bcrypt had truncated at byte 72', `${'Zq7'.repeat(30)}tail-ten-x`],
    ['a trivially weak password set before the rules existed', '12345678'],
    ['one character repeated', 'cccccccc'],
    ['the phone number itself', '+306912345678'],
  ])('lets %s sign in: a stored password keeps working', async (_label, password) => {
    expect(password.length).toBeLessThanOrEqual(128);

    const response = await signInWith({ password });

    expect(response.status).toBe(200);
    expect(mocks.authenticatePortalUser).toHaveBeenCalledWith(expect.objectContaining({ password }));
  });

  it('keeps the existing length bounds: 129 characters are refused', async () => {
    const response = await signInWith({ password: 'x'.repeat(129) });

    expect(response.status).toBe(422);
    expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalUser).not.toHaveBeenCalled();
  });

  it('still limits every well-formed attempt exactly as before: per phone number, 5 in 15 minutes', async () => {
    mocks.authenticatePortalUser.mockRejectedValue(new PortalAuthError('INVALID_CREDENTIALS'));

    const wrongPassword = await signInWith({});

    expect(wrongPassword.status).toBe(401);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { scope: 'portal-session', identifier: PHONE, limit: 5, windowMs: 15 * 60_000 },
    );
    expect(mocks.refundSensitiveIdentifierAttempt).not.toHaveBeenCalled();

    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: false, limit: 5, remaining: 0, resetAt: new Date() });
    mocks.authenticatePortalUser.mockClear();

    const limited = await signInWith({});

    expect(limited.status).toBe(429);
    expect(mocks.authenticatePortalUser).not.toHaveBeenCalled();
  });
});
