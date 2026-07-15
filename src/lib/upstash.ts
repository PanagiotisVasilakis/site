/* Lightweight Upstash Redis wrapper (REST) that works on Edge and Node runtimes.
   Uses fetch against UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
   Exports: incrWithExpire(key, windowMs), get(key), del(key), ping().
*/

const BASE = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REQUEST_TIMEOUT_MS = 2_000;

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  return headers;
}

type UpstashResult = Record<string, unknown> | string | number | null;

async function fetchJson(path: string, options: RequestInit = {}): Promise<UpstashResult> {
  if (!BASE) throw new Error('UPSTASH_REDIS_REST_URL is not configured');
  if (!TOKEN) throw new Error('UPSTASH_REDIS_REST_TOKEN is not configured');
  const res = await fetch(`${BASE}/${path}`, {
    headers: buildHeaders(),
    signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  return res.json();
}

async function runCommand(command: readonly (string | number)[]): Promise<UpstashResult> {
  if (!BASE) throw new Error('UPSTASH_REDIS_REST_URL is not configured');
  if (!TOKEN) throw new Error('UPSTASH_REDIS_REST_TOKEN is not configured');
  const response = await fetch(BASE, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash error ${response.status}: ${text}`);
  }
  return response.json();
}

function unwrapResult(response: UpstashResult): unknown {
  if (response !== null && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'result')) {
    return (response as { result?: unknown }).result;
  }
  return response;
}

export type RateLimitIncrement = {
  count: number;
  resetAfterMs: number;
};

export async function incrWithExpire(key: string, windowMs: number): Promise<RateLimitIncrement> {
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error('Rate-limit window must be a positive integer');
  }

  // Keep increment and first-write expiry in one Redis operation. The previous
  // two-request sequence could leave a counter without a TTL if EXPIRE failed.
  const response = await runCommand([
    'EVAL',
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('PTTL', KEYS[1]); return {count, ttl}",
    1,
    key,
    windowMs,
  ]);
  const result = unwrapResult(response);
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error('Upstash returned an invalid rate-limit result');
  }
  const count = Number(result[0]);
  const resetAfterMs = Number(result[1]);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Upstash returned an invalid rate-limit count');
  }
  if (!Number.isSafeInteger(resetAfterMs) || resetAfterMs < 1 || resetAfterMs > windowMs) {
    throw new Error('Upstash returned an invalid rate-limit TTL');
  }
  return { count, resetAfterMs };
}

export async function get(key: string): Promise<number | null> {
  const resp = await fetchJson(`get/${encodeURIComponent(key)}`);
  // Upstash may return { result: <value> } or a primitive. Handle both.
  const result = unwrapResult(resp);
  return result === null ? null : Number(String(result));
}

export async function del(key: string): Promise<void> {
  await fetchJson(`del/${encodeURIComponent(key)}`, { method: 'POST' });
}

export async function ping(): Promise<boolean> {
  try {
    await fetchJson('ping');
    return true;
  } catch {
    return false;
  }
}
