/**
 * Authentication Module
 * 
 * This module provides two separate authentication systems:
 * 
 * 1. **Admin Authentication** (`auth/admin.ts`)
 *    - JWT-based tokens stored in cookies
 *    - Short-lived (2 hours default)
 *    - For administrative operations
 *    - Routes: /admin/*, /api/admin/*
 * 
 * 2. **Guest Authentication** (`auth/guest.ts`)
 *    - Session-based with JWT + refresh tokens
 *    - Refresh tokens stored in Prisma database
 *    - Tied to user + booking context
 *    - For guest portal and check-in flows
 *    - Routes: /portal/*, /check-in/*, /api/portal/*
 * 
 * ## Usage Examples
 * 
 * ### Admin Auth
 * ```typescript
 * import { signAdmin, verifyAdmin, createAdminPayload } from '@/lib/auth';
 * 
 * // Sign a new admin token
 * const payload = createAdminPayload();
 * const token = signAdmin(payload, '2h');
 * 
 * // Verify an admin token
 * const verified = verifyAdmin(token);
 * if (verified && verified.role === 'admin') {
 *   // Valid admin session
 * }
 * ```
 * 
 * ### Guest Auth
 * ```typescript
 * import { sessionManager, getGuestSessionFromCookies } from '@/lib/auth';
 * 
 * // Create a new guest session
 * const { sessionToken, refreshToken, sessionCookie, refreshCookie } = 
 *   await sessionManager.createSession(userId, bookingId);
 * 
 * // Get current guest session
 * const session = await getGuestSessionFromCookies();
 * if (session?.user?.id) {
 *   // Valid guest session
 * }
 * ```
 * 
 * ## Type Guards
 * ```typescript
 * import { getUserType, isValidUserType } from '@/lib/auth';
 * 
 * const userType = getUserType(payload);
 * if (userType === 'admin') {
 *   // Handle admin
 * } else if (userType === 'guest') {
 *   // Handle guest
 * }
 * ```
 */

// Common utilities
export * from './common';

// Admin authentication
export * from './admin';

// Guest authentication
export * from './guest';

// Legacy re-exports removed now that callers import from concrete modules
