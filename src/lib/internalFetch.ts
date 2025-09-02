import { logger } from '@/lib/logger';

export async function internalFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      logger.warn('internalFetch non-OK response (server)', { input: String(input), status: res.status });
    }
    return res;
  } catch (err) {
    logger.error('internalFetch failed (server)', { input: String(input), error: err });
    throw err;
  }
}
