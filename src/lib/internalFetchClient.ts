// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
import { logger } from '@/lib/logger';

export async function internalFetch(input: string, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      // Log minimal but meaningful context
      logger.warn('internalFetch non-OK response', {
        input,
        status: res.status,
        statusText: res.statusText,
        url: res.url,
      });
    }
    return res;
  } catch (err: unknown) {
    // Do not log AbortError as an error; it's an expected control flow
    const name = (err as { name?: string })?.name || '';
    const code = (err as { code?: string })?.code;
    if (name === 'AbortError' || code === 'ABORT_ERR') {
      logger.debug('internalFetch aborted', { input });
      throw err;
    }
    logger.error('internalFetch failed', {
      input,
      error: err instanceof Error ? err : String(err),
    });
    throw err;
  }
}

export default internalFetch;