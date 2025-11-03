/**
 * Session Cookie Utilities
 * 
 * Standardized helpers for creating, parsing, and managing session cookies.
 * Provides consistent defaults and secure configurations.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { logger } from '@/lib/logger-enterprise';
import { TextEncoder } from 'util';

/**
 * Session cookie configuration
 */
export interface SessionCookieConfig {
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Cookie options */
  options: {
    /** Cookie path */
    path: string;
    /** HTTP only flag */
    httpOnly: boolean;
    /** Same site policy */
    sameSite: 'lax' | 'strict' | 'none';
    /** Secure flag */
    secure: boolean;
    /** Cookie max age in seconds */
    maxAge?: number;
    /** Cookie domain */
    domain?: string;
  };
}

/**
 * Session payload structure
 */
export interface SessionPayload {
  /** User ID */
  userId: string;
  /** User roles */
  roles?: string[];
  /** Expiration timestamp */
  exp?: number;
  /** Issued at timestamp */
  iat?: number;
  /** Issuer */
  iss?: string;
  /** Subject */
  sub?: string;
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Options for session cookie creation
 */
export interface CreateSessionCookieOptions {
  /** Cookie name (default: 'session') */
  name?: string;
  /** Cookie path (default: '/') */
  path?: string;
  /** Cookie max age in seconds (default: 24 hours) */
  maxAge?: number;
  /** Cookie domain */
  domain?: string;
  /** Secure flag (default: true in production) */
  secure?: boolean;
  /** Same site policy (default: 'lax') */
  sameSite?: 'lax' | 'strict' | 'none';
  /** HTTP only flag (default: true) */
  httpOnly?: boolean;
}

/**
 * Create a standardized session cookie
 * 
 * @param payload - Session payload to encode
 * @param secret - Secret key for signing (default: process.env.SESSION_SECRET)
 * @param options - Cookie configuration options
 * @returns SessionCookieConfig object with name, value, and options
 */
export async function createSessionCookie(
  payload: SessionPayload,
  secret?: string,
  options?: CreateSessionCookieOptions
): Promise<SessionCookieConfig> {
  const {
    name = 'session',
    path = '/',
    maxAge = 24 * 60 * 60, // 24 hours
    domain,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'lax',
    httpOnly = true
  } = options || {};

  // Use provided secret or fallback to environment variable
  const secretKey = secret || process.env.SESSION_SECRET;
  if (!secretKey) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  // Create JWT
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + maxAge;

  // Create a proper key buffer for signing
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secretKey);
  
  // Ensure we have enough key material (HS256 requires at least 256 bits = 32 bytes)
  let keyBuffer: Uint8Array;
  if (secretBytes.byteLength < 32) {
    // Pad with zeros if too short (this is for testing only!)
    keyBuffer = new Uint8Array(32);
    keyBuffer.set(secretBytes);
  } else {
    // Truncate if too long (this is for testing only!)
    keyBuffer = secretBytes.slice(0, 32);
  }
  
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setIssuer('next-app')
    .sign(keyBuffer);

  return {
    name,
    value: jwt,
    options: {
      path,
      httpOnly,
      sameSite,
      secure,
      maxAge,
      ...(domain && { domain })
    }
  };
}

/**
 * Parse and verify a session cookie
 * 
 * @param cookieValue - Raw cookie value (JWT string)
 * @param secret - Secret key for verification (default: process.env.SESSION_SECRET)
 * @returns Parsed session payload or null if invalid
 */
export async function parseSessionCookie(
  cookieValue: string,
  secret?: string
): Promise<SessionPayload | null> {
  const secretKey = secret || process.env.SESSION_SECRET;
  if (!secretKey) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  try {
    const { payload } = await jwtVerify(cookieValue, new TextEncoder().encode(secretKey));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    
    return payload as SessionPayload;
  } catch (error) {
    logger.warn('Failed to parse session cookie', { error });
    return null;
  }
}

/**
 * Get session from request cookies
 * 
 * @param cookieName - Name of session cookie (default: 'session')
 * @param secret - Secret key for verification (default: process.env.SESSION_SECRET)
 * @returns Session payload or null if not found/invalid
 */
export async function getSessionFromCookies(
  cookieName = 'session',
  secret?: string
): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(cookieName)?.value;
    
    if (!sessionCookie) {
      return null;
    }
    
    return parseSessionCookie(sessionCookie, secret);
  } catch (error) {
    logger.warn('Failed to access session cookie', { error });
    return null;
  }
}

/**
 * Set session cookie on response
 * 
 * @param response - NextResponse object to modify
 * @param payload - Session payload to encode
 * @param secret - Secret key for signing (default: process.env.SESSION_SECRET)
 * @param options - Cookie configuration options
 * @returns Modified NextResponse with session cookie set
 */
export async function setSessionCookie(
  response: NextResponse,
  payload: SessionPayload,
  secret?: string,
  options?: CreateSessionCookieOptions
): Promise<NextResponse> {
  const cookieConfig = await createSessionCookie(payload, secret, options);
  response.cookies.set(cookieConfig.name, cookieConfig.value, cookieConfig.options);
  return response;
}