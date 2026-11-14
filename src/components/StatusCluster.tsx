"use client";
import { useEffect, useState, useCallback } from 'react';

interface Labels {
  online: string; offline: string; reconnecting: string; slow: string;
}
interface Props { labels: Labels; }

const PROBE_INTERVAL_MS = 60_000;
const PROBE_RETRY_MS = 15_000;
const PROBE_TIMEOUT_MS = 4_000;
// The pill sits in a wrapper that is `sm:hidden` (app/[locale]/layout.tsx), so it is displayed exactly below
// Tailwind's sm breakpoint (40rem; the mobile rules in components/stay.css use the same 640 px edge).
const DISPLAYED_QUERY = '(width < 40rem)';

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
  // Use useCallback to prevent unnecessary re-renders and ensure stable references
  const handleOnline = useCallback(() => {
    // Use React's automatic batching for state updates
    setIsOnline(true);
    setReconnecting(true);
    
    // Set a timeout to clear reconnecting state with proper cleanup
    const timeoutId = setTimeout(() => {
      setReconnecting(false);
    }, 2500);
    
    // Return cleanup function to prevent memory leaks
    return () => clearTimeout(timeoutId);
  }, []);
  
  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setReconnecting(false); // Clear reconnecting when going offline
  }, []);

  useEffect(() => {
    let cleanupReconnecting: (() => void) | undefined;
    
    const handleOnlineWrapper = () => {
      cleanupReconnecting?.(); // Clean up any previous timeout
      cleanupReconnecting = handleOnline();
    };
    
    window.addEventListener('online', handleOnlineWrapper);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnlineWrapper);
      window.removeEventListener('offline', handleOffline);
      cleanupReconnecting?.(); // Clean up timeout on unmount
    };
  }, [handleOnline, handleOffline]);

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

  // Probe to verify connectivity beyond onLine (a captive portal or a dead upstream still reports online). The
  // online/offline events carry a plain loss of network, so the probe is rare: only while the pill is displayed
  // and the tab is visible, at most once a minute after a good result, a quicker retry after a failed one, and
  // never while the browser itself reports offline (the `online` event then probes at once).
  useEffect(() => {
    const media = window.matchMedia?.(DISPLAYED_QUERY);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    // Earliest time of the next probe: now at mount, a visible tab after a long hide probes because it is due.
    let dueAt = 0;

    const canProbe = () => !stopped && navigator.onLine && !document.hidden && (media ? media.matches : true);

    function arm() {
      clearTimeout(timer);
      timer = undefined;
      if (controller || !canProbe()) return;
      timer = setTimeout(probe, Math.max(0, dueAt - Date.now()));
    }

    function cancel() {
      const running = controller;
      controller = undefined;
      running?.abort();
    }

    async function probe() {
      timer = undefined;
      if (!canProbe()) return;
      const ctrl = new AbortController();
      controller = ctrl;
      const timeoutId = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      let reachable = false;
      try {
        await fetch('/app.webmanifest?probe=' + Date.now(), {
          method: 'HEAD',
          cache: 'no-store',
          signal: ctrl.signal
        });
        reachable = true;
      } catch {
        // Unreachable or timed out.
      }
      clearTimeout(timeoutId);
      // Cancelled meanwhile (offline event, unmount): the result is moot.
      if (controller !== ctrl) return;
      controller = undefined;
      setIsOnline(reachable);
      dueAt = Date.now() + (reachable ? PROBE_INTERVAL_MS : PROBE_RETRY_MS);
      arm();
    }

    const handleOnlineEvent = () => {
      dueAt = 0;
      arm();
    };
    const handleOfflineEvent = () => {
      cancel();
      arm();
    };
    const handleDisplayChange = () => arm();

    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);
    document.addEventListener('visibilitychange', handleDisplayChange);
    media?.addEventListener?.('change', handleDisplayChange);
    arm();

    return () => {
      stopped = true;
      clearTimeout(timer);
      cancel();
      window.removeEventListener('online', handleOnlineEvent);
      window.removeEventListener('offline', handleOfflineEvent);
      document.removeEventListener('visibilitychange', handleDisplayChange);
      media?.removeEventListener?.('change', handleDisplayChange);
    };
  }, []);

  const slowRaw = isOnline && effectiveType && /^(2g|slow-2g)$/i.test(effectiveType);
  const netStateRaw = !isOnline ? 'offline' : reconnecting ? 'reconnecting' : slowRaw ? 'slow' : 'online';
  const netLabelRaw = !isOnline ? labels.offline : reconnecting ? labels.reconnecting : slowRaw ? labels.slow : labels.online;

  // During SSR/first client render, lock to stable placeholders so HTML matches
  const netState = hydrated ? netStateRaw : 'online';
  const netLabel = hydrated ? netLabelRaw : labels.online;

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
