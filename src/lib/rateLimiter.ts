/**
 * Rate Limiter - Prisma-based implementation
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';

export class RateLimiter {
  async initialize(): Promise<void> {
    logger.info('Rate limiter initialized');
  }
  
  async isRateLimited(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = new Date();
    const resetTime = new Date(now.getTime() + windowMs);
    
    try {
      const entry = await prisma.rateLimit.findUnique({ where: { key } });
      
      if (!entry) {
        await prisma.rateLimit.create({ data: { key, count: 1, resetTime } });
        return { allowed: true, remaining: limit - 1, resetTime: resetTime.getTime() };
      }
      
      if (entry.resetTime <= now) {
        await prisma.rateLimit.update({ where: { key }, data: { count: 1, resetTime } });
        return { allowed: true, remaining: limit - 1, resetTime: resetTime.getTime() };
      }
      
      if (entry.count >= limit) {
        return { allowed: false, remaining: 0, resetTime: entry.resetTime.getTime() };
      }
      
      await prisma.rateLimit.update({ where: { key }, data: { count: entry.count + 1 } });
      return { allowed: true, remaining: limit - entry.count - 1, resetTime: entry.resetTime.getTime() };
    } catch (error) {
      logger.error('Rate limiter check failed', { error, key });
      return { allowed: true, remaining: limit, resetTime: resetTime.getTime() };
    }
  }
  
  async resetRateLimit(key: string): Promise<void> {
    try {
      await prisma.rateLimit.delete({ where: { key } });
      logger.info('Rate limit reset', { key });
    } catch (error) {
      logger.error('Rate limiter reset failed', { error, key });
    }
  }
  
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const now = new Date();
      const result = await prisma.rateLimit.deleteMany({ where: { resetTime: { lt: now } } });
      const removed = result.count;
      if (removed > 0) {
        logger.info('Expired rate limit entries cleaned up', { count: removed });
      }
      return removed;
    } catch (error) {
      logger.error('Rate limiter cleanup failed', { error });
      return 0;
    }
  }
}

export const rateLimiter = new RateLimiter();
