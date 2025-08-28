"use client";
import { useEffect, useState } from 'react';

interface Labels {
  online: string; offline: string; reconnecting: string; slow: string;
  syncPending: string; syncIdle: string;
}
interface Props { className?: string; labels: Labels; pollMs?: number; }

// Combined network + sync queue indicator in a single pill for compact header usage.
export default function StatusCluster({ className = '', labels, pollMs = 15000 }: Props) {
  // Network
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [reconnecting, setReconnecting] = useState(false);
  const [effectiveType, setEffectiveType] = useState<string | undefined>();
  // Sync
  const [queueSize, setQueueSize] = useState(0);
  // Removed lastSyncTs (unused) to keep component lean.

  useEffect(() => {
    function online() { setIsOnline(true); setReconnecting(true); setTimeout(()=>setReconnecting(false), 2500); }
    function offline() { setIsOnline(false); }
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  useEffect(() => {
    interface NavWithConn extends Navigator { connection?: { effectiveType?: string; addEventListener?(type:string, cb:()=>void): void; removeEventListener?(type:string, cb:()=>void): void } }
    const nav = navigator as NavWithConn;
    function updateConn() { if (nav.connection?.effectiveType) setEffectiveType(nav.connection.effectiveType); }
    updateConn();
    if (nav.connection?.addEventListener) { nav.connection.addEventListener('change', updateConn); return () => nav.connection?.removeEventListener?.('change', updateConn); }
  }, []);

  // Optional polling to verify connectivity beyond onLine
  useEffect(() => {
    if (!pollMs || pollMs < 5000) return; let timer: ReturnType<typeof setTimeout> | undefined; let aborted = false;
    async function probe() {
      if (aborted) return;
      try { const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 4000); await fetch('/manifest.webmanifest?probe='+Date.now(), { method:'HEAD', cache:'no-store', signal: ctrl.signal }); clearTimeout(t); setIsOnline(true); } catch { setIsOnline(false); }
      finally { timer = setTimeout(probe, pollMs); }
    }
    probe();
  return () => { aborted = true; if (timer) clearTimeout(timer); };
  }, [pollMs]);

  // Service worker sync queue listener
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'ANALYTICS_QUEUE_SIZE') {
  setQueueSize(e.data.size || 0);
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  const slow = isOnline && effectiveType && /^(2g|slow-2g)$/i.test(effectiveType);
  const netState = !isOnline ? 'offline' : reconnecting ? 'reconnecting' : slow ? 'slow' : 'online';
  const netLabel = !isOnline ? labels.offline : reconnecting ? labels.reconnecting : slow ? labels.slow : labels.online;
  const syncLabel = queueSize > 0 ? `${labels.syncPending} (${queueSize})` : labels.syncIdle;

  const aria = `${netLabel}. ${syncLabel}.`;
  const dotColorVar = netState === 'offline' ? 'var(--badge-warn-bg)' : netState === 'slow' ? 'var(--brand-400)' : 'var(--brand-500)';
  const warn = queueSize > 0 || netState === 'offline';

  return (
    <button
      type="button"
      className={`net-status ${className}`.trim()}
      data-state={warn ? 'offline' : 'online'}
      aria-live="polite"
      aria-label={aria + (queueSize>0 ? ' Tap to sync now.' : '')}
      title={aria}
      onClick={() => { if (queueSize > 0) navigator.serviceWorker?.controller?.postMessage({ type:'REPLAY_ANALYTICS' }); }}
      style={{ display:'inline-flex', gap:'.5rem' }}
    >
      <span className="net-status-dot" aria-hidden style={{ background: dotColorVar }} />
      <span className="flex items-center gap-1">
        <span>{netLabel}</span>
        <span aria-hidden>·</span>
        <span>{syncLabel}</span>
      </span>
    </button>
  );
}
