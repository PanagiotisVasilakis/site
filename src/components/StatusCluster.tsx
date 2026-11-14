"use client";
import { useEffect, useState } from 'react';

interface Labels {
  online: string; offline: string; reconnecting: string; slow: string;
}
interface Props { labels: Labels; }

const POLL_MS = 15_000;

// Network status indicator in a single pill for compact header usage.
export default function StatusCluster({ labels }: Props) {
  // Ensure SSR and first client paint match to avoid hydration mismatches
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  // Network
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [reconnecting, setReconnecting] = useState(false);
  const [effectiveType, setEffectiveType] = useState<string | undefined>();

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const handleOnline = () => {
      clearTimeout(reconnectTimer);
      setIsOnline(true);
      setReconnecting(true);
      reconnectTimer = setTimeout(() => setReconnecting(false), 2500);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setReconnecting(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    interface NavWithConn extends Navigator { 
      connection?: { 
        effectiveType?: string; 
        addEventListener?(type: string, cb: () => void): void; 
        removeEventListener?(type: string, cb: () => void): void;
      };
    }
    
    const nav = navigator as NavWithConn;
    
    const updateConn = () => {
      if (nav.connection?.effectiveType) {
        setEffectiveType(nav.connection.effectiveType);
      }
    };
    
    updateConn();
    
    if (nav.connection?.addEventListener) {
      nav.connection.addEventListener('change', updateConn);
      return () => nav.connection?.removeEventListener?.('change', updateConn);
    }
  }, []);

  // Polling to verify connectivity beyond onLine
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    
    async function probe() {
      if (aborted) return;
      // Skip the network probe while the tab is hidden; online/offline events still apply.
      if (document.hidden) {
        timer = setTimeout(probe, POLL_MS);
        return;
      }

      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 4000);
        
        await fetch('/app.webmanifest?probe=' + Date.now(), {
          method: 'HEAD',
          cache: 'no-store',
          signal: ctrl.signal
        });
        
        clearTimeout(timeoutId);
        
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      } finally {
        if (!aborted) {
          timer = setTimeout(probe, POLL_MS);
        }
      }
    }
    
    probe();
    
    return () => {
      aborted = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const slowRaw = isOnline && effectiveType && /^(2g|slow-2g)$/i.test(effectiveType);
  const netStateRaw = !isOnline ? 'offline' : reconnecting ? 'reconnecting' : slowRaw ? 'slow' : 'online';

  // During SSR/first client render, lock to stable placeholders so HTML matches
  const netState = hydrated ? netStateRaw : 'online';
  const netLabel = labels[netState];

  const aria = `${netLabel}.`;

  // Colours come from tokens per state (components/stay.css, R3-V9).
  return (
    <span
      role="status"
      className="net-status"
      data-state={netState}
      aria-live="polite"
      aria-label={aria}
      title={aria}
    >
      <span className="net-status-dot" aria-hidden />
      <span className="net-status__label">{netLabel}</span>
    </span>
  );
}
