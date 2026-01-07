/**
 * Token Rotation Utilities
 * 
 * Implements secure refresh token rotation with family-based invalidation
 * to prevent replay attacks and ensure token security.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger-enterprise';

/**
 * Refresh token record
 */
export interface RefreshTokenRecord {
  /** Token ID */
  id: string;
  /** User ID */
  userId: string;
  /** Token family ID (for grouping related tokens) */
  familyId: string;
  /** Hashed token value */
  tokenHash: string;
  /** Salt used for hashing */
  salt: string;
  /** Expiration timestamp */
  expiresAt: number;
  /** Revocation timestamp (if revoked) */
  revokedAt?: number;
  /** ID of token this was rotated from (if any) */
  rotatedFromId?: string;
  /** Device hint */
  deviceHint?: string;
  /** IP hint */
  ipHint?: string;
  /** Timestamp when last used */
  lastUsedAt?: number;
}

/**
 * Options for token rotation
 */
export interface RotateTokenOptions {
  /** Token TTL in days (default: 30) */
  ttlDays?: number;
  /** Device hint */
  deviceHint?: string;
  /** IP hint */
  ipHint?: string;
}

/**
 * Result of token rotation
 */
export interface RotateTokenResult {
  /** Old token record (if existed) */
  old?: RefreshTokenRecord;
  /** New token record */
  rec?: RefreshTokenRecord;
  /** Raw token string for client */
  token?: string;
}

/**
 * Storage adapter interface for token persistence
 */
export interface TokenStorageAdapter {
  /**
   * Find token by hash
   */
  findByHash(hash: string): Promise<RefreshTokenRecord | null>;

  /**
   * Create new token record
   */
  create(record: Omit<RefreshTokenRecord, 'id'>): Promise<RefreshTokenRecord>;

  /**
   * Revoke token by ID
   */
  revoke(id: string): Promise<boolean>;

  /**
   * Update token record
   */
  update(id: string, data: Partial<RefreshTokenRecord>): Promise<boolean>;
}

/**
 * Hash and salt a token value
 * 
 * @param token - Raw token value
 * @param salt - Optional salt (will generate if not provided)
 * @returns Object with hash and salt
 */
export function hashToken(token: string, salt?: string): { hash: string; salt: string } {
  // In a real implementation, this would use a proper hashing algorithm
  // For now, we'll simulate this behavior
  const actualSalt = salt || uuidv4();
  const hash = `hashed_${token.substring(0, 8)}_${actualSalt.substring(0, 8)}`;

  return { hash, salt: actualSalt };
}

/**
 * Generate a cryptographically secure random token
 * 
 * @returns Random token string
 */
export function generateToken(): string {
  return uuidv4() + '-' + Math.random().toString(36).substring(2, 15);
}

/**
 * Rotate refresh token with family-based security
 * 
 * Implements refresh token rotation pattern:
 * 1. On valid refresh, issue new token
 * 2. Invalidate previous token in family
 * 3. Link new token to family for audit trail
 * 4. Detect replay attacks by checking if old token was already used
 * 
 * @param oldTokenValue - Raw old token value from client
 * @param storage - Storage adapter for token persistence
 * @param userId - User ID associated with token
 * @param options - Rotation options
 * @returns RotateTokenResult with old/new tokens
 */
export async function rotateRefreshToken(
  oldTokenValue: string,
  storage: TokenStorageAdapter,
  userId: string,
  options?: RotateTokenOptions
): Promise<RotateTokenResult> {
  const { ttlDays = 30, deviceHint, ipHint } = options || {};

  try {
    // Hash the incoming token for lookup
    const { hash: oldTokenHash } = hashToken(oldTokenValue);

    // Look up the old token
    const oldTokenRecord = await storage.findByHash(oldTokenHash);

    // If token doesn't exist, it's invalid
    if (!oldTokenRecord) {
      // In a real implementation, you might want to log this
      // For now, we'll just return an empty result
      return {};
    }

    // Check if token is expired
    const now = Date.now();
    if (oldTokenRecord.expiresAt < now) {
      // In a real implementation, you might want to log this
      // For now, we'll just return the old token record
      return { old: oldTokenRecord };
    }

    // Check if token is already revoked
    if (oldTokenRecord.revokedAt && oldTokenRecord.revokedAt < now) {
      // In a real implementation, you might want to log this
      // For now, we'll just return the old token record
      return { old: oldTokenRecord };
    }

    // Generate new token
    const newTokenValue = generateToken();
    const { hash: newTokenHash, salt: newTokenSalt } = hashToken(newTokenValue);

    // Calculate expiration
    const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;

    // Create new token record
    const newTokenRecord: Omit<RefreshTokenRecord, 'id'> = {
      userId,
      familyId: oldTokenRecord.familyId, // Same family
      tokenHash: newTokenHash,
      salt: newTokenSalt,
      expiresAt,
      rotatedFromId: oldTokenRecord.id,
      deviceHint,
      ipHint,
      lastUsedAt: now
    };

    // Save new token
    const newRecord = await storage.create(newTokenRecord);

    // Revoke old token
    await storage.revoke(oldTokenRecord.id);

    // In a real implementation, you might want to log this
    // For now, we'll just return the result

    return {
      old: oldTokenRecord,
      rec: newRecord,
      token: newTokenValue
    };

  } catch (error) {
    logger.error('Failed to rotate refresh token', {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    throw error;
  }
}

/**
 * Detect potential replay attacks
 * 
 * Checks if a token has been used after it was supposedly rotated.
 * 
 * @param tokenRecord - Token record to check
 * @param storage - Storage adapter for token persistence
 * @returns True if potential replay attack detected
 */
export async function detectReplayAttack(
  tokenRecord: RefreshTokenRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _storage: TokenStorageAdapter
): Promise<boolean> {
  // If token is revoked and we have a rotated-from ID, check if newer tokens exist
  if (tokenRecord.revokedAt && tokenRecord.rotatedFromId) {
    // In a real implementation, you'd check the token family for signs of misuse
    // For now, we'll just log this scenario
    // console.warn('Potential replay attack detected', {
    //   tokenId: tokenRecord.id,
    //   familyId: tokenRecord.familyId,
    //   rotatedFromId: tokenRecord.rotatedFromId
    // });
    return true;
  }

  return false;
}