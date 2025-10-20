/* Lightweight Upstash Redis wrapper (REST) that works on Edge and Node runtimes.
   Uses fetch against UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
   Exports: incrWithExpire(key, windowMs), get(key), del(key), ping().
*/

const BASE = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  return headers;
}

async function fetchJson(path: string, options: RequestInit = {}): Promise<Record<string, unknown> | string | number | null> {
  if (!BASE) throw new Error('UPSTASH_REDIS_REST_URL is not configured');
  const res = await fetch(`${BASE}/${path}`, { headers: buildHeaders(), ...options });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function incrWithExpire(key: string, windowMs: number): Promise<number> {
  // INCR
  const incrResp = await fetchJson(`incr/${encodeURIComponent(key)}`, { method: 'POST' });
  // Response can be { result: <number> } or a primitive number/string
  let count: number;
  if (incrResp !== null && typeof incrResp === 'object' && Object.prototype.hasOwnProperty.call(incrResp, 'result')) {
    const r = (incrResp as { result?: unknown }).result;
    count = Number(String(r));
  } else {
    count = Number(String(incrResp));
  }

  if (count === 1) {
    // Set expire to window seconds
    const seconds = Math.ceil(windowMs / 1000);
    await fetchJson(`expire/${encodeURIComponent(key)}/${seconds}`, { method: 'POST' });
  }

  return count;
}

export async function get(key: string): Promise<number | null> {
  const resp = await fetchJson(`get/${encodeURIComponent(key)}`);
  // Upstash may return { result: <value> } or a primitive. Handle both.
  if (resp === null) return null;
  if (typeof resp === 'object' && resp !== null && Object.prototype.hasOwnProperty.call(resp, 'result')) {
    const r = (resp as { result: unknown }).result;
    return r === null ? null : Number(String(r));
  }
  return Number(String(resp));
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
