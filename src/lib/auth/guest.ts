/**
 * Guest authentication system using JWT sessions + Prisma refresh tokens
 * Used for: /portal/* routes, guest check-in flows, booking management
 * 
 * Key differences from admin auth:
 * - Session-based (short-lived JWT + long-lived refresh tokens)
 * - Refresh tokens stored in database for revocation
 * - Tied to user + booking context
 * - Supports auto-refresh via cookies
 */

import { BaseAuthPayload } from './common';

// Re-export all guest session functionality
export {
  type GuestSessionPayload,
  type BookingSource,
  type BookingStatus,
  signGuestSession,
  parseGuestSession,
  getGuestSessionFromCookies,
  hasVerifiedBookingSession,
  createSessionCookie,
  createSessionCookieWithMaxAge,
  clearSessionCookie,
  createRefreshCookie,
  clearRefreshCookie,
  SessionManager,
  sessionManager,
  tryAutoMintSessionFromRefresh,
} from '@/lib/guestSession';

// Type augmentation for guest auth payload
export interface GuestAuthPayload extends BaseAuthPayload {
  type: 'guest';
  user?: { id: string };
  booking?: { id?: string };
}

/**
 * Type guard to check if a payload is a guest session
 */
export function isGuestSession(payload: unknown): payload is GuestAuthPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return !!(p.user && typeof p.user === 'object');
}
