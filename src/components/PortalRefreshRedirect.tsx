"use client";

import { useEffect, useRef } from 'react';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

type PortalRefreshRedirectProps = {
  refreshHref: string;
  failureHref: string;
  /** Test seams; production callers should use the browser defaults. */
  fetcher?: Fetcher;
  sleep?: Sleep;
  navigate?: (href: string) => void;
  maxAttempts?: number;
};

export type PortalRefreshResult =
  | { status: 'refreshed'; href: string }
  | { status: 'failed' }
  | { status: 'aborted' };

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5_000;

export function toSafeLocalHref(value: string, baseHref: string): string | null {
  return toSafeLocalPath(value, baseHref);
}

function toSafeRefreshDestination(value: string, baseHref: string): string | null {
  const safeHref = toSafeLocalHref(value, baseHref);
  if (!safeHref) return null;
  const pathname = new URL(safeHref, baseHref).pathname.replace(/\/$/, '');
  if (pathname === '/api/portal/refresh' || pathname.endsWith('/portal/refresh')) return null;
  return safeHref;
}

function retryDelayFrom(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return DEFAULT_RETRY_DELAY_MS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
}

async function isConcurrentRefresh(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  try {
    const body = await response.json() as {
      code?: string;
      error?: string | { code?: string };
    };
    const code = typeof body.error === 'object' ? body.error?.code : body.code;
    return code === 'REFRESH_IN_PROGRESS';
  } catch {
    return false;
  }
}

const defaultSleep: Sleep = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Portal refresh aborted', 'AbortError'));
    return;
  }

  const timeout = window.setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, milliseconds);
  const abort = () => {
    window.clearTimeout(timeout);
    reject(new DOMException('Portal refresh aborted', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
});

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || (error instanceof DOMException && error.name === 'AbortError');
}

export async function refreshPortalSession({
  refreshHref,
  baseHref,
  fetcher = fetch,
  sleep = defaultSleep,
  signal,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: {
  refreshHref: string;
  baseHref: string;
  fetcher?: Fetcher;
  sleep?: Sleep;
  signal?: AbortSignal;
  maxAttempts?: number;
}): Promise<PortalRefreshResult> {
  const safeRefreshHref = toSafeLocalHref(refreshHref, baseHref);
  if (!safeRefreshHref) return { status: 'failed' };

  const refreshUrl = new URL(safeRefreshHref, baseHref);
  if (refreshUrl.pathname !== '/api/portal/refresh') return { status: 'failed' };
  const safeNextHref = toSafeRefreshDestination(refreshUrl.searchParams.get('next') || '', baseHref);
  const requestedAttempts = Number.isFinite(maxAttempts) ? Math.floor(maxAttempts) : DEFAULT_MAX_ATTEMPTS;
  const attemptLimit = Math.min(DEFAULT_MAX_ATTEMPTS, Math.max(1, requestedAttempts));

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    if (signal?.aborted) return { status: 'aborted' };

    try {
      const response = await fetcher(safeRefreshHref, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: { accept: 'application/json' },
        signal,
      });

      if (await isConcurrentRefresh(response)) {
        if (attempt === attemptLimit) return { status: 'failed' };
        await sleep(retryDelayFrom(response), signal);
        continue;
      }

      if (!response.ok) return { status: 'failed' };

      if (response.redirected) {
        const followedRedirect = toSafeRefreshDestination(response.url, baseHref);
        return followedRedirect
          ? { status: 'refreshed', href: followedRedirect }
          : { status: 'failed' };
      }

      return safeNextHref
        ? { status: 'refreshed', href: safeNextHref }
        : { status: 'failed' };
    } catch (error) {
      if (isAbort(error, signal)) return { status: 'aborted' };
      return { status: 'failed' };
    }
  }

  return { status: 'failed' };
}

export default function PortalRefreshRedirect({
  refreshHref,
  failureHref,
  fetcher,
  sleep,
  navigate,
  maxAttempts,
}: PortalRefreshRedirectProps) {
  const navigationStarted = useRef(false);
  const safeFailureLink = toSafeLocalPath(failureHref) ?? '/';

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const baseHref = window.location.href;

    void refreshPortalSession({
      refreshHref,
      baseHref,
      fetcher,
      sleep,
      signal: controller.signal,
      maxAttempts,
    }).then((result) => {
      if (!active || result.status === 'aborted' || navigationStarted.current) return;

      const safeFailureHref = toSafeLocalHref(failureHref, baseHref) || '/';
      const destination = result.status === 'refreshed' ? result.href : safeFailureHref;
      navigationStarted.current = true;
      if (navigate) {
        navigate(destination);
      } else {
        window.location.replace(destination);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [failureHref, fetcher, maxAttempts, navigate, refreshHref, sleep]);

  return (
    <div className="page-bg min-h-[50vh] px-4 py-10">
      <div className="surface-card mx-auto max-w-md rounded-lg p-6 text-center shadow-sm">
        <h1 className="page-title text-xl font-serif italic font-bold">Refreshing your session</h1>
        <p className="mt-3 text-sm text-body" role="status">
          Please wait while we restore access to your check-in information.
        </p>
        <a className="btn-primary mt-5" href={safeFailureLink}>
          Sign in instead
        </a>
      </div>
    </div>
  );
}
