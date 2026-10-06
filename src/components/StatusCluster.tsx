"use client";
import { useEffect, useState, useCallback } from 'react';

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
        
        // Only update if we're currently offline to avoid unnecessary re-renders
        setIsOnline(current => current ? current : true);
      } catch {
        // Only update if we're currently online to avoid unnecessary re-renders
        setIsOnline(current => current ? false : current);
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
