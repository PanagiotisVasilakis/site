/**
 * MFA Repository - Prisma-based implementation
 * Handles Multi-Factor Authentication factors and challenges
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import type { MfaFactorType, MfaFactorStatus } from '@prisma/client';
import crypto from 'node:crypto';

export type { MfaFactorType, MfaFactorStatus };

export interface MFAFactorRecord {
  id: string;
  userId: string;
  type: MfaFactorType;
  secretHash: string;
  secretSalt: string;
  backupCodesHash?: string | null;
  backupCodesSalt?: string | null;
  phoneNumberEnc?: string | null;
  emailEnc?: string | null;
  status: MfaFactorStatus;
  createdAt: Date;
  activatedAt?: Date | null;
  lastUsedAt?: Date | null;
}

export interface MFAChallengeRecord {
  id: string;
  userId: string;
  factorId: string;
  challengeCodeHash: string;
  challengeCodeSalt: string;
  expiresAt: Date;
  completedAt?: Date | null;
  createdAt: Date;
}

export class MFARepository {
  /**
   * Create a new MFA factor
   */
  async createFactor(input: {
    userId: string;
    type: MfaFactorType;
    secretHash: string;
    secretSalt: string;
    backupCodesHash?: string;
    backupCodesSalt?: string;
    phoneNumberEnc?: string;
    emailEnc?: string;
  }): Promise<MFAFactorRecord> {
    const factor = await prisma.mfaFactor.create({
      data: {
        id: crypto.randomUUID(),
        userId: input.userId,
        type: input.type,
        secretHash: input.secretHash,
        secretSalt: input.secretSalt,
        backupCodesHash: input.backupCodesHash,
        backupCodesSalt: input.backupCodesSalt,
        phoneNumberEnc: input.phoneNumberEnc,
        emailEnc: input.emailEnc,
        status: 'PENDING',
      },
    });

    logger.info('MFA factor created', { 
      factorId: factor.id, 
      userId: input.userId, 
      type: input.type 
    });

    return factor as MFAFactorRecord;
  }

  /**
   * Activate a pending MFA factor
   */
  async activateFactor(factorId: string): Promise<MFAFactorRecord | null> {
    try {
      const factor = await prisma.mfaFactor.update({
        where: { 
          id: factorId,
          status: 'PENDING' // Only activate pending factors
        },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      });

      logger.info('MFA factor activated', { factorId });
      return factor as MFAFactorRecord;
    } catch (error) {
      logger.warn('Failed to activate MFA factor', { factorId }, error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Get all active MFA factors for a user
   */
  async getActiveFactorsByUserId(userId: string): Promise<MFAFactorRecord[]> {
    const factors = await prisma.mfaFactor.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return factors as MFAFactorRecord[];
  }

  /**
   * Get a specific MFA factor
   */
  async getFactorById(factorId: string): Promise<MFAFactorRecord | null> {
    const factor = await prisma.mfaFactor.findUnique({
      where: { id: factorId },
    });

    return factor as MFAFactorRecord | null;
  }

  /**
   * Get factors with backup codes for a user
   */
  async getFactorsWithBackupCodes(userId: string): Promise<MFAFactorRecord[]> {
    const factors = await prisma.mfaFactor.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        backupCodesHash: {
          not: null,
        },
      },
    });

    return factors as MFAFactorRecord[];
  }

  /**
   * Update factor's last used timestamp
   */
  async updateLastUsed(factorId: string): Promise<void> {
    await prisma.mfaFactor.update({
      where: { id: factorId },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Disable an MFA factor
   */
  async disableFactor(userId: string, factorId: string): Promise<boolean> {
    try {
      await prisma.mfaFactor.update({
        where: {
          id: factorId,
          userId, // Ensure user owns the factor
          status: 'ACTIVE',
        },
        data: {
          status: 'INACTIVE',
        },
      });

      logger.info('MFA factor disabled', { userId, factorId });
      return true;
    } catch (error) {
      logger.warn('Failed to disable MFA factor', { userId, factorId }, error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * Create an MFA challenge
   */
  async createChallenge(input: {
    userId: string;
    factorId: string;
    challengeCodeHash: string;
    challengeCodeSalt: string;
    expiresAt: Date;
  }): Promise<MFAChallengeRecord> {
    const challenge = await prisma.mfaChallenge.create({
      data: {
        id: crypto.randomUUID(),
        userId: input.userId,
        factorId: input.factorId,
        challengeCodeHash: input.challengeCodeHash,
        challengeCodeSalt: input.challengeCodeSalt,
        expiresAt: input.expiresAt,
      },
    });

    logger.info('MFA challenge created', { 
      challengeId: challenge.id, 
      userId: input.userId, 
      factorId: input.factorId 
    });

    return challenge as MFAChallengeRecord;
  }

  /**
   * Get an active (non-expired, not completed) challenge
   */
  async getActiveChallenge(challengeId: string): Promise<MFAChallengeRecord | null> {
    const challenge = await prisma.mfaChallenge.findFirst({
      where: {
        id: challengeId,
        expiresAt: {
          gt: new Date(),
        },
        completedAt: null,
      },
    });

    return challenge as MFAChallengeRecord | null;
  }

  /**
   * Mark a challenge as completed
   */
  async completeChallenge(challengeId: string): Promise<void> {
    await prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: {
        completedAt: new Date(),
      },
    });

    logger.info('MFA challenge completed', { challengeId });
  }

  /**
   * Clean up expired challenges
   */
  async cleanupExpiredChallenges(maxAgeMinutes: number = 60): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const result = await prisma.mfaChallenge.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      logger.info('Expired MFA challenges cleaned up', { count: result.count });
    }

    return result.count;
  }
}

// Export singleton instance
export const mfaRepository = new MFARepository();
