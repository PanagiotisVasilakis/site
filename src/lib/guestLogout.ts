"use client";
import internalFetch from '@/lib/internalFetchClient';
import { emitGuestSessionChanged } from '@/lib/sessionSignals';

/**
 * Logs out the current guest by calling the API and emits a cross-tab signal so UI updates instantly.
 * Returns true on success (204) and false otherwise.
 */
export async function guestLogout(): Promise<boolean> {
  try {
    const res = await internalFetch('/api/portal/logout', { method: 'POST' });
    const ok = res.status === 204;
    // Fire-and-forget signal so other tabs immediately re-check session state
    try { emitGuestSessionChanged('logout'); } catch {}
    return ok;
  } catch {
    try { emitGuestSessionChanged('logout_error'); } catch {}
    return false;
  }
}

export default guestLogout;
