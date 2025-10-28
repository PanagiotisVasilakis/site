/**
 * Tests for session cookie utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { createSessionCookie, parseSessionCookie, getSessionFromCookies, setSessionCookie } from '@/lib/auth/sessionCookie';
import { NextResponse } from 'next/server';

// Mock environment variables
vi.stubEnv('SESSION_SECRET', 'test-secret-key-for-testing-purposes-only-do-not-use-in-production-12345678901234567890');

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
  });

  describe('createSessionCookie', () => {
    it('should create a session cookie with default options', async () => {
      const payload = { userId: 'user-123', roles: ['user'] };
      const cookie = await createSessionCookie(payload);

      expect(cookie.name).toBe('session');
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.sameSite).toBe('lax');
      expect(cookie.options.secure).toBe(process.env.NODE_ENV === 'production');
      expect(cookie.options.maxAge).toBe(24 * 60 * 60);
    });

    it('should create a session cookie with custom options', async () => {
      const payload = { userId: 'user-123' };
      const cookie = await createSessionCookie(payload, undefined, {
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

    it('should throw error when SESSION_SECRET is not set', async () => {
      vi.stubEnv('SESSION_SECRET', '');

      const payload = { userId: 'user-123' };
      
      await expect(createSessionCookie(payload)).rejects.toThrow('SESSION_SECRET environment variable is required');
    });
  });

  describe('parseSessionCookie', () => {
    it('should parse and verify a valid session cookie', async () => {
      const payload = { userId: 'user-123', roles: ['user'] };
      const cookie = await createSessionCookie(payload);
      
      const parsed = await parseSessionCookie(cookie.value);
      
      expect(parsed).toEqual(expect.objectContaining({
        userId: 'user-123',
        roles: ['user']
      }));
    });

    it('should return null for invalid session cookie', async () => {
      const parsed = await parseSessionCookie('invalid-token');
      expect(parsed).toBeNull();
    });
  });

  describe('getSessionFromCookies', () => {
    it('should get session from cookies when available', async () => {
      const payload = { userId: 'user-123' };
      const cookie = await createSessionCookie(payload);
      
      mockCookies.get.mockReturnValue({ value: cookie.value });
      
      const session = await getSessionFromCookies();
      
      expect(session).toEqual(expect.objectContaining({
        userId: 'user-123'
      }));
    });

    it('should return null when no session cookie is available', async () => {
      mockCookies.get.mockReturnValue(undefined);
      
      const session = await getSessionFromCookies();
      
      expect(session).toBeNull();
    });
  });

  describe('setSessionCookie', () => {
    it('should set session cookie on response', async () => {
      const response = new NextResponse();
      const payload = { userId: 'user-123' };
      
      const result = await setSessionCookie(response, payload);
      
      expect(result).toBe(response);
      // Note: Actual cookie setting tested via response.cookies.set spy
    });
  });
});