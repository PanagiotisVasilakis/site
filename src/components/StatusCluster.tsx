"use client";
import { useEffect, useState } from 'react';

interface Labels {
  online: string; offline: string; reconnecting: string; slow: string;
}
interface Props { labels: Labels; }

const OFFLINE_RETRY_MS = 15_000;
const VISIBLE_PROBE_COOLDOWN_MS = 60_000;
const MOBILE_MEDIA_QUERY = '(min-width: 640px)';

// Network status indicator in a single pill for compact mobile usage (`sm:hidden`).
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

  // Probe real origin reachability only on mobile viewports (where the pill is
  // visible) and only when state changes (online event, returning to a stale
  // tab, or retrying while offline) so idle tabs let serverless origins sleep.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeController: AbortController | null = null;
    let aborted = false;
    let lastProbeAt = Date.now();
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_MEDIA_QUERY)
      : null;

    const isMobileVisible = () => (!media || !media.matches) && !document.hidden;

    async function probe() {
      if (aborted || !isMobileVisible()) return;

      activeController?.abort();
      const ctrl = new AbortController();
      activeController = ctrl;
      const timeoutId = setTimeout(() => ctrl.abort(), 4000);
      let onlineNow = false;

      try {
        await fetch('/app.webmanifest?probe=' + Date.now(), {
          method: 'HEAD',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        onlineNow = true;
      } catch {
        onlineNow = false;
      } finally {
        clearTimeout(timeoutId);
        if (activeController === ctrl) activeController = null;
      }

      if (aborted) return;
      lastProbeAt = Date.now();
      setIsOnline(onlineNow);
      if (!onlineNow && isMobileVisible()) {
        clearTimeout(timer);
        timer = setTimeout(() => { void probe(); }, OFFLINE_RETRY_MS);
      }
    }

    const onOnline = () => {
      clearTimeout(timer);
      void probe();
    };
    const onVisibility = () => {
      if (document.hidden) return;
      if (Date.now() - lastProbeAt >= VISIBLE_PROBE_COOLDOWN_MS) {
        void probe();
      }
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      void probe();
    }

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      aborted = true;
      clearTimeout(timer);
      activeController?.abort();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
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
