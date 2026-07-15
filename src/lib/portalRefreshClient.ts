import { toSafeLocalPath } from '@/lib/safeLocalPath';

export type PortalRefreshResult =
  | { status: 'refreshed'; href: string }
  | { status: 'failed' }
  | { status: 'aborted' };

const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5_000;

function safeRefreshDestination(value: string, baseHref: string): string | null {
  const safeHref = toSafeLocalPath(value, baseHref);
  if (!safeHref) return null;
  const pathname = new URL(safeHref, baseHref).pathname.replace(/\/$/, '');
  if (pathname === '/api/portal/refresh' || pathname.endsWith('/portal/refresh')) return null;
  return safeHref;
}

function retryDelayFrom(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
}

async function isConcurrentRefresh(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  try {
    const body = await response.json() as { code?: string; error?: string | { code?: string } };
    const code = typeof body.error === 'object' ? body.error?.code : body.code;
    return code === 'REFRESH_IN_PROGRESS';
  } catch {
    return false;
  }
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Portal refresh aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Portal refresh aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

export async function refreshPortalSession(input: {
  refreshHref: string;
  baseHref: string;
  signal?: AbortSignal;
}): Promise<PortalRefreshResult> {
  const safeRefreshHref = toSafeLocalPath(input.refreshHref, input.baseHref);
  if (!safeRefreshHref) return { status: 'failed' };

  const refreshUrl = new URL(safeRefreshHref, input.baseHref);
  if (refreshUrl.pathname !== '/api/portal/refresh') return { status: 'failed' };
  const safeNextHref = safeRefreshDestination(refreshUrl.searchParams.get('next') || '', input.baseHref);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (input.signal?.aborted) return { status: 'aborted' };
    try {
      const response = await fetch(safeRefreshHref, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: { accept: 'application/json' },
        signal: input.signal,
      });
      if (await isConcurrentRefresh(response)) {
        if (attempt === MAX_ATTEMPTS) return { status: 'failed' };
        await sleep(retryDelayFrom(response), input.signal);
        continue;
      }
      if (!response.ok) return { status: 'failed' };
      if (response.redirected) {
        const followedRedirect = safeRefreshDestination(response.url, input.baseHref);
        return followedRedirect ? { status: 'refreshed', href: followedRedirect } : { status: 'failed' };
      }
      return safeNextHref ? { status: 'refreshed', href: safeNextHref } : { status: 'failed' };
    } catch (error) {
      if (isAbort(error, input.signal)) return { status: 'aborted' };
      return { status: 'failed' };
    }
  }
  return { status: 'failed' };
}
