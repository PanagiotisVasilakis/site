/**
 * Common authentication utilities shared between admin and guest auth systems
 */

export type UserType = 'admin' | 'guest';

export interface BaseAuthPayload {
  type: UserType;
  iat?: number;
  exp?: number;
}

/**
 * Type guard to check if a value is a valid user type
 */
export function isValidUserType(type: unknown): type is UserType {
  return type === 'admin' || type === 'guest';
}

/**
 * Extract user type from a JWT payload
 */
export function getUserType(payload: Record<string, unknown>): UserType | null {
  if (payload.role === 'admin') return 'admin';
  if (payload.user && payload.booking) return 'guest';
  return null;
}

/**
 * Validate token age to prevent use of very old tokens
 */
export function isTokenTooOld(iat: number | undefined, maxAgeSeconds: number): boolean {
  if (!iat) return true;
  const tokenAge = Date.now() / 1000 - iat;
  return tokenAge > maxAgeSeconds;
}
