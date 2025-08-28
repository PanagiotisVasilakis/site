"use client";
import { useEffect, useState } from 'react';

interface Metric { id: number; path: string; source: string; }

/**
 * Lightweight HUD showing recent JSON fetch source (cache/network) messages
 * broadcast by the service worker (SW_JSON_FETCH). Auto-hides after inactivity.
 */
export default function JsonFetchHud() {
  const isProd = process.env.NODE_ENV === 'production';
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isProd) return; // do nothing in production
    let id = 0;
    let hideTimer: number | null = null;
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.type !== 'SW_JSON_FETCH') return;
      id += 1;
      setMetrics(m => {
        const next = [...m, { id, path: data.path, source: data.source }];
        return next.slice(-8); // keep last 8
      });
      setVisible(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setVisible(false), 6000);
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [isProd]);
  if (isProd || !metrics.length) return null;
  return (
    <div
      className="fixed z-50 bottom-2 right-2 text-[10px] font-mono bg-black/70 text-white rounded-md shadow-lg backdrop-blur p-2 max-w-[50vw]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms' }}
      aria-live="polite"
    >
      <div className="font-semibold mb-1">JSON Fetch</div>
      <ul className="space-y-0.5">
        {metrics.slice().reverse().map(m => (
          <li key={m.id} className="flex items-center gap-1">
            <span className={m.source === 'cache' ? 'text-emerald-300' : 'text-sky-300'}>{m.source === 'cache' ? 'C' : 'N'}</span>
            <span className="truncate" title={m.path}>{m.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
