// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
import { logger } from '@/lib/logger';

export async function internalFetch(input: string, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      logger.warn('internalFetch non-OK response', { input, status: res.status });
    }
    return res;
  } catch (err) {
    logger.error('internalFetch failed', { input, error: err });
    throw err;
  }
}

export default internalFetch;