// Thin client-side wrapper to satisfy internal-fetch lint rule and allow
// consistent future enhancements (auth headers, logging, etc.)
import { logger } from '@/lib/logger';

export const ADMIN_SECRET_STORAGE_KEY = 'admin_secret';

/**
 * Get correlation ID from server-side logger context if available
 * Falls back to undefined in browser context
 * 
 * For now, correlation ID propagation is handled at the API route level
 * via middleware. Client-side internal fetches don't have access to
 * server-side AsyncLocalStorage context.
 * 
 * TODO: Consider adding correlation ID to response headers and storing
 * in browser context for subsequent requests.
 */
function getCorrelationId(): string | undefined {
  // Correlation ID propagation is server-side only
  // Handled by middleware for API routes
  return undefined;
}

function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage?.getItem(ADMIN_SECRET_STORAGE_KEY) || null;
  } catch (err) {
    logger.warn('internalFetch admin secret access failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function buildHeaders(init?: RequestInit, adminSecret?: string): HeadersInit | undefined {
  const shouldAttachSecret = Boolean(adminSecret);
  const correlationId = getCorrelationId();
  
  // Only create headers if we have something to add
  if (!shouldAttachSecret && !correlationId && !init?.headers) {
    return init?.headers;
  }

  const headers = new Headers(init?.headers as HeadersInit | undefined);
  
  // Attach admin secret for admin API calls
  if (shouldAttachSecret && adminSecret) {
    headers.set('x-admin-secret', adminSecret);
  }
  
  // Propagate correlation ID for request tracing (server-side only)
  if (correlationId) {
    headers.set('X-Correlation-ID', correlationId);
    headers.set('X-Request-ID', correlationId);
  }
  
  return headers;
}

async function internalFetch(input: string, init?: RequestInit) {
  const isAdminAPI = typeof input === 'string' && input.startsWith('/api/admin/');
  const adminSecret = isAdminAPI ? getAdminSecret() : null;
  const finalInit: RequestInit = { ...init };

  if (typeof window !== 'undefined') {
    finalInit.credentials = finalInit.credentials ?? 'same-origin';
  }

  const headers = buildHeaders(init, adminSecret ?? undefined);
  if (headers) {
    finalInit.headers = headers;
  }

  try {
    const res = await fetch(input, finalInit);
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