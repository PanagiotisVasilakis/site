import { ADMIN_SECRET_STORAGE_KEY } from '@/lib/internalFetchClient';

export function persistAdminSecretFromUrl(): void {
  if (typeof window === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token')?.trim();
    if (!token) return;

    window.sessionStorage?.setItem(ADMIN_SECRET_STORAGE_KEY, token);
    params.delete('token');
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState({}, document.title, url.toString());
  } catch (err) {
    console.warn('Failed to persist admin token', err);
  }
}

export function getStoredAdminSecret(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage?.getItem(ADMIN_SECRET_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearStoredAdminSecret(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage?.removeItem(ADMIN_SECRET_STORAGE_KEY);
  } catch {
    // Ignore storage failures during logout.
  }
}
