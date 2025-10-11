import crypto from 'node:crypto';
import { getDatabase } from '@/lib/database';
import { logger } from '@/lib/logger';
import { hashSensitive, verifySensitive } from '@/lib/crypto';

export type MFAType = 'TOTP' | 'SMS' | 'EMAIL' | 'BACKUP_CODE';
export type MFAStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface MFAFactor {
  id: string;
  user_id: string;
  type: MFAType;
  secret_hash: string;
  secret_salt: string;
  backup_codes_hash?: string;
  backup_codes_salt?: string;
  phone_number_enc?: string;
  email_enc?: string;
  status: MFAStatus;
  created_at: number;
  activated_at?: number;
  last_used_at?: number;
}

export interface MFAChallenge {
  id: string;
  user_id: string;
  factor_id: string;
  challenge_code_hash: string;
  challenge_code_salt: string;
  expires_at: number;
  completed_at?: number;
  created_at: number;
}

interface BackupCodeDigest {
  hash: string;
  salt: string;
}

export class MFAService {
  async enrollUserInMFA(
    userId: string,
    type: MFAType,
    secret: string,
    opts?: {
      phoneNumber?: string;
      email?: string;
      backupCodes?: string[];
    }
  ): Promise<MFAFactor> {
    const db = await getDatabase();
    const id = this.generateId('mfa');
    const now = Date.now();
    
    // Hash the secret
    const { hash: secretHash, salt: secretSalt } = hashSensitive(secret);
    
    // Hash backup codes if provided
    let backupCodesHash: string | undefined;
    let backupCodesSalt: string | undefined;

    if (opts?.backupCodes && opts.backupCodes.length > 0) {
      const digests: BackupCodeDigest[] = opts.backupCodes.map((code) => hashSensitive(code));
      backupCodesHash = JSON.stringify(digests);
      backupCodesSalt = undefined;
    }
    
    await db.run(
      `INSERT INTO mfa_factors (
        id, user_id, type, secret_hash, secret_salt, backup_codes_hash, 
        backup_codes_salt, phone_number_enc, email_enc, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      type,
      secretHash,
      secretSalt,
      backupCodesHash,
      backupCodesSalt,
      opts?.phoneNumber,
      opts?.email,
      'PENDING',
      now
    );
    
    logger.info('User enrolled in MFA', { userId, type, factorId: id });
    
    return {
      id,
      user_id: userId,
      type,
      secret_hash: secretHash,
      secret_salt: secretSalt,
      backup_codes_hash: backupCodesHash,
      backup_codes_salt: backupCodesSalt,
      phone_number_enc: opts?.phoneNumber,
      email_enc: opts?.email,
      status: 'PENDING',
      created_at: now
    };
  }
  
  async activateMFA(factorId: string): Promise<MFAFactor | undefined> {
    const db = await getDatabase();
    const now = Date.now();
    
    const result = await db.run(
      'UPDATE mfa_factors SET status = ?, activated_at = ? WHERE id = ? AND status = ?',
      'ACTIVE',
      now,
      factorId,
      'PENDING'
    );
    
    if (result.changes === 0) {
      return undefined;
    }
    
    const row = await db.get('SELECT * FROM mfa_factors WHERE id = ?', factorId);
    logger.info('MFA factor activated', { factorId });
    
    return row as MFAFactor;
  }
  
  async getUserMFAFactors(userId: string): Promise<MFAFactor[]> {
    const db = await getDatabase();
    const rows = await db.all(
      'SELECT * FROM mfa_factors WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
      userId,
      'ACTIVE'
    );
    
    return rows as MFAFactor[];
  }
  
  async createChallenge(userId: string, factorId: string): Promise<{ challenge: MFAChallenge; code: string } | undefined> {
    const db = await getDatabase();
    const now = Date.now();
    
    // Check if factor exists and is active
    const factor = await db.get(
      'SELECT * FROM mfa_factors WHERE id = ? AND user_id = ? AND status = ?',
      factorId,
      userId,
      'ACTIVE'
    );
    
    if (!factor) {
      return undefined;
    }
    
    // Generate a random 6-digit code
  const code = crypto.randomInt(100000, 1000000).toString();
    const { hash: codeHash, salt: codeSalt } = hashSensitive(code);
    
    const challengeId = this.generateId('mfac');
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes
    
    await db.run(
      `INSERT INTO mfa_challenges (
        id, user_id, factor_id, challenge_code_hash, challenge_code_salt, 
        expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      challengeId,
      userId,
      factorId,
      codeHash,
      codeSalt,
      expiresAt,
      now
    );
    
    logger.info('MFA challenge created', { userId, factorId, challengeId });
    
    return {
      challenge: {
        id: challengeId,
        user_id: userId,
        factor_id: factorId,
        challenge_code_hash: codeHash,
        challenge_code_salt: codeSalt,
        expires_at: expiresAt,
        created_at: now
      },
      code
    };
  }
  
  async verifyChallenge(challengeId: string, code: string): Promise<boolean> {
    const db = await getDatabase();
    const now = Date.now();
    
    // Get the challenge
    const challenge = await db.get(
      'SELECT * FROM mfa_challenges WHERE id = ? AND expires_at > ? AND completed_at IS NULL',
      challengeId,
      now
    ) as MFAChallenge | undefined;
    
    if (!challenge) {
      return false;
    }
    
    // Verify the code
    const isValid = verifySensitive(code, challenge.challenge_code_salt, challenge.challenge_code_hash);
    
    if (isValid) {
      // Mark challenge as completed
      await db.run(
        'UPDATE mfa_challenges SET completed_at = ? WHERE id = ?',
        now,
        challengeId
      );
      
      // Update factor's last used timestamp
      await db.run(
        'UPDATE mfa_factors SET last_used_at = ? WHERE id = ?',
        now,
        challenge.factor_id
      );
      
      logger.info('MFA challenge verified', { challengeId, factorId: challenge.factor_id });
    } else {
      logger.warn('MFA challenge verification failed', { challengeId, factorId: challenge.factor_id });
    }
    
    return isValid;
  }
  
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const db = await getDatabase();
    
    // Get all active MFA factors for the user that have backup codes
    const factors = await db.all(
      `SELECT * FROM mfa_factors 
       WHERE user_id = ? AND status = ? AND backup_codes_hash IS NOT NULL AND backup_codes_salt IS NOT NULL`,
      userId,
      'ACTIVE'
    ) as MFAFactor[];
    
    // Try to verify against each factor's backup codes
    for (const factor of factors) {
      if (factor.backup_codes_hash) {
        let digests: BackupCodeDigest[] = [];
        try {
          const parsed = JSON.parse(factor.backup_codes_hash) as BackupCodeDigest[];
          if (Array.isArray(parsed)) {
            digests = parsed;
          }
        } catch (error) {
          logger.error('Failed to parse stored backup codes', { error, factorId: factor.id });
          continue;
        }

        for (const digest of digests) {
          if (verifySensitive(code, digest.salt, digest.hash)) {
            const now = Date.now();
            await db.run(
              'UPDATE mfa_factors SET last_used_at = ? WHERE id = ?',
              now,
              factor.id
            );

            logger.info('Backup code verified', { userId, factorId: factor.id });
            return true;
          }
        }
      }
    }
    
    logger.warn('Backup code verification failed', { userId });
    return false;
  }
  
  async disableMFA(userId: string, factorId: string): Promise<boolean> {
    const db = await getDatabase();
    
    const result = await db.run(
      'UPDATE mfa_factors SET status = ? WHERE id = ? AND user_id = ? AND status = ?',
      'INACTIVE',
      factorId,
      userId,
      'ACTIVE'
    );
    
  const disabled = (result.changes ?? 0) > 0;
    if (disabled) {
      logger.info('MFA factor disabled', { userId, factorId });
    }
    
    return disabled;
  }
  
  async cleanupExpiredChallenges(maxAgeMinutes: number = 60): Promise<number> {
    const db = await getDatabase();
    const cutoff = Date.now() - maxAgeMinutes * 60 * 60 * 1000;
    
    const result = await db.run(
      'DELETE FROM mfa_challenges WHERE created_at < ?',
      cutoff
    );
    
  const removed = result.changes ?? 0;
  if (removed > 0) {
      logger.info('Expired MFA challenges cleaned up', { count: removed });
    }
    
  return removed;
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Export singleton instance
export const mfaService = new MFAService();