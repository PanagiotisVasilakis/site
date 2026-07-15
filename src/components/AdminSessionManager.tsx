"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';

const NORMAL_REFRESH_DELAY_MS = 105 * 60 * 1000;
const FAILED_REFRESH_RETRY_MS = 60 * 1000;

// Refreshes the admin JWT proactively and backs off briefly after failures.
export default function AdminSessionManager() {
  const [status, setStatus] = useState<'ok'|'refreshing'|'error'>('ok');
  const timerRef = useRef<number | undefined>(undefined);
  const scheduleRef = useRef<(delay: number) => void>(() => {});

  const refreshSession = useCallback(async (): Promise<boolean> => {
    setStatus('refreshing');
    try {
      const res = await internalFetch('/api/admin/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('refresh failed');
      setStatus('ok');
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    const schedule = (delay: number) => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        const refreshed = await refreshSession();
        schedule(refreshed ? NORMAL_REFRESH_DELAY_MS : FAILED_REFRESH_RETRY_MS);
      }, delay);
    };
    scheduleRef.current = schedule;
    schedule(NORMAL_REFRESH_DELAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [refreshSession]);

  async function retryRefresh() {
    const refreshed = await refreshSession();
    scheduleRef.current(refreshed ? NORMAL_REFRESH_DELAY_MS : FAILED_REFRESH_RETRY_MS);
  }

  async function logout() {
    try {
      const response = await internalFetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout failed');
      window.location.reload();
    } catch {
      setStatus('error');
    }
  }
  return (
    <>
      <div className="fixed top-2 right-2 z-50 flex gap-2 items-center text-xs px-2 py-1 rounded shadow" style={{background:'var(--brand-700)', color:'var(--fg-inverse)'}}>
        <span>Session: {status}</span>
        <button type="button" onClick={logout} disabled={status === 'refreshing'} className="bg-white/20 hover:bg-white/30 px-1 rounded disabled:opacity-60">Logout</button>
      </div>
      {status === 'error' && (
        <div className="fixed top-12 right-2 z-50 max-w-xs bg-red-600 text-white text-xs px-3 py-2 rounded shadow animate-pulse">
          Token refresh failed. You may need to re-login.<br />
          <button type="button" onClick={() => void retryRefresh()} className="underline mt-1 inline-block">Retry now</button>
        </div>
      )}
    </>
  );
}
