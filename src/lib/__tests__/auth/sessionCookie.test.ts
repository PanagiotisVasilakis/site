/**
 * Tests for session cookie utilities
 * 
 * @vitest-environment node
 */


import { NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';

// Polyfill Web Crypto API for Node.js environment
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - webcrypto is compatible with Web Crypto API
  globalThis.crypto = webcrypto;
}

// Test secret - must be at least 32 chars for HS256
const TEST_SECRET = 'test-secret-key-for-testing-purposes-only-do-not-use-in-production-12345678901234567890';

// Mock cookies
const mockCookies = {
  get: vi.fn(),
  set: vi.fn(),
};

// Mock Next.js cookies function
vi.mock('next/headers', () => ({
  cookies: () => mockCookies,
}));

describe('sessionCookie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set SESSION_SECRET before each test
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    // Clean up
    vi.unstubAllEnvs();
  });

  describe('createSessionCookie', () => {
    it('should create a session cookie with default options', async () => {
      // Import fresh module after env is set
      const { createSessionCookie } = await import('@/lib/auth/sessionCookie');

      const payload = { userId: 'user-123', roles: ['user'] };
      const cookie = await createSessionCookie(payload, TEST_SECRET);

      expect(cookie.name).toBe('session');
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.sameSite).toBe('lax');
      expect(cookie.options.secure).toBe(process.env.NODE_ENV === 'production');
      expect(cookie.options.maxAge).toBe(24 * 60 * 60);
      expect(cookie.value).toBeTruthy(); // Has a JWT value
    });

    it('should create a session cookie with custom options', async () => {
      const { createSessionCookie } = await import('@/lib/auth/sessionCookie');

      const payload = { userId: 'user-123' };
      const cookie = await createSessionCookie(payload, TEST_SECRET, {
        name: 'custom-session',
        maxAge: 3600,
        path: '/api',
        domain: 'example.com',
        secure: true,
        sameSite: 'strict',
        httpOnly: false
      });

      expect(cookie.name).toBe('custom-session');
      expect(cookie.options.maxAge).toBe(3600);
      expect(cookie.options.path).toBe('/api');
      expect(cookie.options.domain).toBe('example.com');
      expect(cookie.options.secure).toBe(true);
      expect(cookie.options.sameSite).toBe('strict');
      expect(cookie.options.httpOnly).toBe(false);
    });

    it('should throw error when SESSION_SECRET is not set and no secret provided', async () => {
      // Clear the env var
      delete process.env.SESSION_SECRET;

      // Need fresh import to pick up env change
      vi.resetModules();
      const { createSessionCookie } = await import('@/lib/auth/sessionCookie');

      const payload = { userId: 'user-123' };

      await expect(createSessionCookie(payload)).rejects.toThrow('SESSION_SECRET environment variable is required');
    });
  });

  describe('parseSessionCookie', () => {
    it('should parse and verify a valid session cookie', async () => {
      const { createSessionCookie, parseSessionCookie } = await import('@/lib/auth/sessionCookie');

      const payload = { userId: 'user-123', roles: ['user'] };
      const cookie = await createSessionCookie(payload, TEST_SECRET);

      const parsed = await parseSessionCookie(cookie.value, TEST_SECRET);

      expect(parsed).toEqual(expect.objectContaining({
        userId: 'user-123',
        roles: ['user']
      }));
    });

    it('should return null for invalid session cookie', async () => {
      const { parseSessionCookie } = await import('@/lib/auth/sessionCookie');

      const parsed = await parseSessionCookie('invalid-token', TEST_SECRET);
      expect(parsed).toBeNull();
    });
  });

  describe('getSessionFromCookies', () => {
    it('should get session from cookies when available', async () => {
      const { createSessionCookie, getSessionFromCookies } = await import('@/lib/auth/sessionCookie');

      const payload = { userId: 'user-123' };
      const cookie = await createSessionCookie(payload, TEST_SECRET);

      mockCookies.get.mockReturnValue({ value: cookie.value });

      const session = await getSessionFromCookies('session', TEST_SECRET);

      expect(session).toEqual(expect.objectContaining({
        userId: 'user-123'
      }));
    });

    it('should return null when no session cookie is available', async () => {
      const { getSessionFromCookies } = await import('@/lib/auth/sessionCookie');

      mockCookies.get.mockReturnValue(undefined);

      const session = await getSessionFromCookies('session', TEST_SECRET);

      expect(session).toBeNull();
    });
  });

  describe('setSessionCookie', () => {
    it('should set session cookie on response', async () => {
      const { setSessionCookie } = await import('@/lib/auth/sessionCookie');

      const response = new NextResponse();
      const payload = { userId: 'user-123' };

      const result = await setSessionCookie(response, payload, TEST_SECRET);

      expect(result).toBe(response);
      // The cookie should be set on the response
    });
  });
});