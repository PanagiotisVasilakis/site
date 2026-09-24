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
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}
