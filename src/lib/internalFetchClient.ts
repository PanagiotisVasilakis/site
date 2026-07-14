// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
import { logger } from '@/lib/logger-client';

const CORRELATION_STORAGE_KEY = 'correlation_id';

/**
 * Read the last response correlation ID stored by this client wrapper.
 * Client-side fetches cannot access server-side AsyncLocalStorage context.
 */
function readStoredCorrelationId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage?.getItem(CORRELATION_STORAGE_KEY) || undefined;
  } catch (err) {
    logger.warn('internalFetch correlation read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function writeStoredCorrelationId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(CORRELATION_STORAGE_KEY, id);
  } catch (err) {
    logger.warn('internalFetch correlation write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getCorrelationId(): string | undefined {
  return readStoredCorrelationId();
}

function buildHeaders(init?: RequestInit): HeadersInit | undefined {
  const correlationId = getCorrelationId();
  
  // Only create headers if we have something to add
  if (!correlationId && !init?.headers) {
    return init?.headers;
  }

  const headers = new Headers(init?.headers as HeadersInit | undefined);
  
  // Propagate correlation ID for request tracing (client-side stored)
  if (correlationId) {
    headers.set('X-Parent-Correlation-ID', correlationId);
  }
  
  return headers;
}

async function internalFetch(input: string, init?: RequestInit) {
  const finalInit: RequestInit = { ...init };

  if (typeof window !== 'undefined') {
    finalInit.credentials = finalInit.credentials ?? 'same-origin';
  }

  const headers = buildHeaders(init);
  if (headers) {
    finalInit.headers = headers;
  }

  try {
    const res = await fetch(input, finalInit);

    if (typeof window !== 'undefined') {
      const headerId = res.headers.get('x-correlation-id') || res.headers.get('X-Correlation-ID');
      if (headerId) {
        writeStoredCorrelationId(headerId);
      }
    }
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
