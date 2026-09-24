// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
import { logger } from '@/lib/logger-client';

async function internalFetch(input: string, init?: RequestInit) {
  const finalInit: RequestInit = { ...init };

  if (typeof window !== 'undefined') {
    finalInit.credentials = finalInit.credentials ?? 'same-origin';
  }

  try {
    const res = await fetch(input, finalInit);
    if (!res.ok) {
      // Treat common auth failures as debug to prevent log spam (they are often expected from unauthenticated clients)
      if (res.status === 401) {
        logger.debug('internalFetch unauthorized response', {
          input,
          status: res.status,
          url: res.url,
        });
      } else {
        // Log minimal but meaningful context for other non-OK responses
        logger.warn('internalFetch non-OK response', {
          input,
          status: res.status,
          statusText: res.statusText,
          url: res.url,
        });
      }
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
