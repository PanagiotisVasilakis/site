// Server-side download of the Airbnb calendar export (AIRBNB_ICAL_URL). The URL
// carries a secret token in its query string, so neither it, a redirect
// Location nor any upstream error text may reach an error message or a log:
// failures carry a code and at most an HTTP status. Every request target,
// including each redirect, must pass the same allowlist as the environment
// schema, which keeps the fetch away from internal addresses.

import { isAirbnbCalendarUrl } from '@/lib/runtime-env-schema.js';

const MAX_REDIRECTS = 2;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_048_576; // 1 MiB, the parser's input cap
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type CalendarFetchErrorCode =
  | 'invalid_url'
  | 'timeout'
  | 'network'
  | 'redirect_rejected'
  | 'too_many_redirects'
  | 'http_status'
  | 'too_large'
  | 'invalid_encoding';

export class CalendarFetchError extends Error {
  readonly code: CalendarFetchErrorCode;
  readonly httpStatus: number | undefined;

  constructor(code: CalendarFetchErrorCode, httpStatus?: number) {
    super(httpStatus === undefined
      ? `Calendar fetch failed: ${code}`
      : `Calendar fetch failed: ${code} ${httpStatus}`);
    this.name = 'CalendarFetchError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readCappedText(response: Response, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isSafeInteger(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    await discardBody(response);
    throw new CalendarFetchError('too_large');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelOnAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CalendarFetchError('too_large');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new CalendarFetchError('invalid_encoding');
  }
}

function allowedRedirectTarget(location: string | null, base: URL): URL | null {
  if (location === null) return null;
  try {
    const target = new URL(location, base);
    return isAirbnbCalendarUrl(target.href) ? target : null;
  } catch {
    return null;
  }
}

async function fetchFollowingAllowedRedirects(start: URL, signal: AbortSignal): Promise<string> {
  let current = start;
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(current.href, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal,
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      await discardBody(response);
      if (redirects >= MAX_REDIRECTS) throw new CalendarFetchError('too_many_redirects');
      const next = allowedRedirectTarget(response.headers.get('location'), current);
      if (!next) throw new CalendarFetchError('redirect_rejected');
      current = next;
      continue;
    }
    if (response.status !== 200) {
      await discardBody(response);
      throw new CalendarFetchError('http_status', response.status);
    }
    return readCappedText(response, signal);
  }
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError';
}

/**
 * Downloads the calendar export as text. Throws CalendarFetchError, or the
 * caller's own abort reason when `options.signal` aborts first.
 */
export async function fetchAirbnbCalendarText(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  if (!isAirbnbCalendarUrl(url)) throw new CalendarFetchError('invalid_url');

  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    return await fetchFollowingAllowedRedirects(new URL(url), signal);
  } catch (error) {
    if (error instanceof CalendarFetchError) throw error;
    if (timeout.aborted) throw new CalendarFetchError('timeout');
    if (options.signal?.aborted) throw options.signal.reason;
    // Upstream errors are replaced, never wrapped: their text can hold the URL.
    throw new CalendarFetchError(isTimeoutError(error) ? 'timeout' : 'network');
  }
}
