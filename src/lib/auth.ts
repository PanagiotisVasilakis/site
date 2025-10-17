/**
 * @deprecated This file is kept for backwards compatibility.
 * Please import from '@/lib/auth' (the auth/ directory) instead.
 * 
 * New structure:
 * - '@/lib/auth' or '@/lib/auth/admin' for admin auth
 * - '@/lib/auth/guest' for guest auth
 * - '@/lib/auth/common' for shared utilities
 */

// Re-export everything from the new auth module
export * from '@/lib/auth/admin';
export * from '@/lib/auth/common';
