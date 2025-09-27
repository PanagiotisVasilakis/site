"use client";
import { useEffect, useRef, useState } from 'react';
import internalFetch, { ADMIN_SECRET_STORAGE_KEY } from '@/lib/internalFetchClient';

// Polls remaining time and refreshes JWT 5 minutes before 2h expiry, provides logout button.
export default function AdminSessionManager() {
  const [status, setStatus] = useState<'ok'|'refreshing'|'error'>('ok');
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token')?.trim();
      if (token) {
  window.sessionStorage?.setItem(ADMIN_SECRET_STORAGE_KEY, token);
        params.delete('token');
        const url = new URL(window.location.href);
        url.search = params.toString();
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (err) {
      console.warn('AdminSessionManager failed to persist admin token', err);
    }
  }, []);
  useEffect(() => {
    function schedule() {
      // Refresh every 105 minutes (2h - 15m) proactive
      const intervalMs = 105 * 60 * 1000;
      timerRef.current = window.setTimeout(doRefresh, intervalMs);
    }
    async function doRefresh() {
      setStatus('refreshing');
      try {
  const res = await internalFetch('/api/admin/refresh', { method: 'POST' });
        if (!res.ok) throw new Error('refresh failed');
        setStatus('ok');
      } catch {
        setStatus('error');
      } finally {
        schedule();
      }
    }
    schedule();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  async function logout() {
  await internalFetch('/api/admin/logout', { method: 'POST' });
    try {
  window.sessionStorage?.removeItem(ADMIN_SECRET_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  }
  return (
    <>
  <div className="fixed top-2 right-2 z-50 flex gap-2 items-center text-xs px-2 py-1 rounded shadow" style={{background:'var(--brand-700)', color:'var(--fg-inverse)'}}>
        <span>Session: {status}</span>
        <button onClick={logout} className="bg-white/20 hover:bg-white/30 px-1 rounded">Logout</button>
      </div>
      {status === 'error' && (
        <div className="fixed top-12 right-2 z-50 max-w-xs bg-red-600 text-white text-xs px-3 py-2 rounded shadow animate-pulse">
          Token refresh failed. You may need to re-login (open login page or supply admin secret).<br />
          <button onClick={() => window.location.reload()} className="underline mt-1 inline-block">Retry</button>
        </div>
      )}
    </>
  );
}
