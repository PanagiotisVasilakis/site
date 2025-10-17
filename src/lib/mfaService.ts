import crypto from 'node:crypto';
import { mfaRepository, type MFAFactorRecord, type MfaFactorType, type MfaFactorStatus } from '@/lib/prisma-repositories/mfaRepository';
import { logger } from '@/lib/logger-enterprise';
import { hashSensitive, verifySensitive } from '@/lib/crypto';

export type MFAType = MfaFactorType;
export type MFAStatus = MfaFactorStatus;

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

// Helper to convert Prisma records to legacy format
function toPrismaRecord(record: MFAFactorRecord): MFAFactor {
  return {
    id: record.id,
    user_id: record.userId,
    type: record.type,
    secret_hash: record.secretHash,
    secret_salt: record.secretSalt,
    backup_codes_hash: record.backupCodesHash ?? undefined,
    backup_codes_salt: record.backupCodesSalt ?? undefined,
    phone_number_enc: record.phoneNumberEnc ?? undefined,
    email_enc: record.emailEnc ?? undefined,
    status: record.status,
    created_at: record.createdAt.getTime(),
    activated_at: record.activatedAt?.getTime(),
    last_used_at: record.lastUsedAt?.getTime(),
  };
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
    
    const factor = await mfaRepository.createFactor({
      userId,
      type,
      secretHash,
      secretSalt,
      backupCodesHash,
      backupCodesSalt,
      phoneNumberEnc: opts?.phoneNumber,
      emailEnc: opts?.email,
    });
    
    logger.info('User enrolled in MFA', { userId, type, factorId: factor.id });
    
    return toPrismaRecord(factor);
  }
  
  async activateMFA(factorId: string): Promise<MFAFactor | undefined> {
    const factor = await mfaRepository.activateFactor(factorId);
    
    if (!factor) {
      return undefined;
    }
    
    logger.info('MFA factor activated', { factorId });
    return toPrismaRecord(factor);
  }
  
  async getUserMFAFactors(userId: string): Promise<MFAFactor[]> {
    const factors = await mfaRepository.getActiveFactorsByUserId(userId);
    return factors.map(toPrismaRecord);
  }
  
  async createChallenge(userId: string, factorId: string): Promise<{ challenge: MFAChallenge; code: string } | undefined> {
    // Check if factor exists and is active
    const factor = await mfaRepository.getFactorById(factorId);
    
    if (!factor || factor.userId !== userId || factor.status !== 'ACTIVE') {
      return undefined;
    }
    
    // Generate a random 6-digit code
    const code = crypto.randomInt(100000, 1000000).toString();
    const { hash: codeHash, salt: codeSalt } = hashSensitive(code);
    
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    const challenge = await mfaRepository.createChallenge({
      userId,
      factorId,
      challengeCodeHash: codeHash,
      challengeCodeSalt: codeSalt,
      expiresAt,
    });
    
    logger.info('MFA challenge created', { userId, factorId, challengeId: challenge.id });
    
    return {
      challenge: {
        id: challenge.id,
        user_id: challenge.userId,
        factor_id: challenge.factorId,
        challenge_code_hash: challenge.challengeCodeHash,
        challenge_code_salt: challenge.challengeCodeSalt,
        expires_at: challenge.expiresAt.getTime(),
        created_at: challenge.createdAt.getTime(),
      },
      code
    };
  }
  
  async verifyChallenge(challengeId: string, code: string): Promise<boolean> {
    // Get the challenge
    const challenge = await mfaRepository.getActiveChallenge(challengeId);
    
    if (!challenge) {
      return false;
    }
    
    // Verify the code
    const isValid = verifySensitive(code, challenge.challengeCodeSalt, challenge.challengeCodeHash);
    
    if (isValid) {
      // Mark challenge as completed
      await mfaRepository.completeChallenge(challengeId);
      
      // Update factor's last used timestamp
      await mfaRepository.updateLastUsed(challenge.factorId);
      
      logger.info('MFA challenge verified', { challengeId, factorId: challenge.factorId });
    } else {
      logger.warn('MFA challenge verification failed', { challengeId, factorId: challenge.factorId });
    }
    
    return isValid;
  }
  
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // Get all active MFA factors for the user that have backup codes
    const factors = await mfaRepository.getFactorsWithBackupCodes(userId);
    
    // Try to verify against each factor's backup codes
    for (const factor of factors) {
      if (factor.backupCodesHash) {
        let digests: BackupCodeDigest[] = [];
        try {
          const parsed = JSON.parse(factor.backupCodesHash) as BackupCodeDigest[];
          if (Array.isArray(parsed)) {
            digests = parsed;
          }
        } catch (error) {
          logger.error('Failed to parse stored backup codes', { error, factorId: factor.id });
          continue;
        }

        for (const digest of digests) {
          if (verifySensitive(code, digest.salt, digest.hash)) {
            await mfaRepository.updateLastUsed(factor.id);
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
    return await mfaRepository.disableFactor(userId, factorId);
  }
  
  async cleanupExpiredChallenges(maxAgeMinutes: number = 60): Promise<number> {
    return await mfaRepository.cleanupExpiredChallenges(maxAgeMinutes);
  }
}

// Export singleton instance
export const mfaService = new MFAService();