// Helper to fetch internal routes safely from client components
export async function internalGet<T>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith('/')) throw new Error('internalGet expects a relative path starting with /');
  const res = await fetch(path, { ...init, method: 'GET' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function internalPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  if (!path.startsWith('/')) throw new Error('internalPost expects a relative path starting with /');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// Note: This file can be imported by both server and client components
// Only using console logging to avoid Node.js dependencies
export async function internalFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    if (!res.ok && typeof console !== 'undefined') {
      console.warn('[internalFetch] non-OK response', { input: String(input), status: res.status });
    }
    return res;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error('[internalFetch] failed', { input: String(input), error: err });
    }
    throw err;
  }
}
