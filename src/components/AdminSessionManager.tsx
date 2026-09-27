"use client";
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import internalFetch from '@/lib/internalFetchClient';

const LOGIN_PATH = '/admin/login';
const REFRESH_LEAD_MS = 5 * 60 * 1000;
const FAILED_REFRESH_RETRY_MS = 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Keeps the admin session alive while the admin is active. Mounted once by
 * src/app/admin/layout.tsx with the server-side session expiry.
 *
 * Shortly before expiry it refreshes the session if the admin loaded or used
 * the page since the last refresh; an idle tab goes to the login page at
 * expiry. A refused refresh (revoked session, 24 h absolute limit) also goes to
 * the login page; other failures retry every minute until expiry.
 */
export default function AdminSessionManager({ expiresAt }: { expiresAt: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<'ok' | 'refreshing' | 'error'>('ok');
  const retryRef = useRef<() => void>(() => {});
  const active = expiresAt !== null && pathname !== LOGIN_PATH;

  useEffect(() => {
    if (!active || expiresAt === null) return;
    let disposed = false;
    let expiry = Date.parse(expiresAt);
    let lastActivity = Date.now();
    let lastRefresh = 0;
    let idle = false;
    let refreshTimer: number | undefined;
    let expiryTimer: number | undefined;

    const toLogin = () => {
      if (!disposed) router.replace(LOGIN_PATH);
    };

    const refresh = async () => {
      window.clearTimeout(refreshTimer);
      idle = false;
      setStatus('refreshing');
      try {
        const response = await internalFetch('/api/admin/refresh', { method: 'POST' });
        if (disposed) return;
        if (response.status === 401) {
          toLogin();
          return;
        }
        const body = response.ok ? await response.json() as { expiresAt?: string } : {};
        const next = Date.parse(body.expiresAt ?? '');
        if (!Number.isFinite(next)) throw new Error('refresh failed');
        if (disposed) return;
        expiry = next;
        lastRefresh = Date.now();
        setStatus('ok');
        schedule();
      } catch {
        if (disposed) return;
        setStatus('error');
        if (Date.now() >= expiry) toLogin();
        else refreshTimer = window.setTimeout(() => void refresh(), FAILED_REFRESH_RETRY_MS);
      }
    };

    const onRefreshDue = () => {
      if (lastActivity > lastRefresh) void refresh();
      else idle = true;
    };

    function schedule() {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(expiryTimer);
      const now = Date.now();
      refreshTimer = window.setTimeout(onRefreshDue, Math.max(0, expiry - REFRESH_LEAD_MS - now));
      expiryTimer = window.setTimeout(toLogin, Math.max(0, expiry - now));
    }

    const onActivity = () => {
      lastActivity = Date.now();
      if (idle && lastActivity < expiry) void refresh();
    };

    retryRef.current = () => void refresh();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true });
    // An expiry that has already passed is a stale layout prop (for example
    // right after a new login); ask the server instead of redirecting.
    if (!Number.isFinite(expiry) || expiry <= Date.now()) void refresh();
    else schedule();

    return () => {
      disposed = true;
      retryRef.current = () => {};
      window.clearTimeout(refreshTimer);
      window.clearTimeout(expiryTimer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
    };
  }, [active, expiresAt, router]);

  async function logout() {
    try {
      const response = await internalFetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout failed');
      window.location.reload();
    } catch {
      setStatus('error');
    }
  }

  if (!active) return null;
  return (
    <>
      <div className="fixed top-2 right-2 z-50 flex gap-2 items-center text-xs px-2 py-1 rounded shadow" style={{background:'var(--brand-700)', color:'var(--fg-inverse)'}}>
        <span>Session: {status}</span>
        <button type="button" onClick={logout} disabled={status === 'refreshing'} className="bg-white/20 hover:bg-white/30 px-1 rounded disabled:opacity-60">Logout</button>
      </div>
      {status === 'error' && (
        <div className="fixed top-12 right-2 z-50 max-w-xs bg-red-600 text-white text-xs px-3 py-2 rounded shadow animate-pulse">
          Token refresh failed. You may need to re-login.<br />
          <button type="button" onClick={() => retryRef.current()} className="underline mt-1 inline-block">Retry now</button>
        </div>
      )}
    </>
  );
}
