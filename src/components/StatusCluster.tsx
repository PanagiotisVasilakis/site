"use client";
import { useEffect, useState, useCallback } from 'react';

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

  // Optional polling to verify connectivity beyond onLine
  useEffect(() => {
    if (!pollMs || pollMs < 5000) return;
    
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    
    async function probe() {
      if (aborted) return;
      
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 4000);
        
        await fetch('/manifest.webmanifest?probe=' + Date.now(), {
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
          timer = setTimeout(probe, pollMs);
        }
      }
    }
    
    probe();
    
    return () => {
      aborted = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs]);

  // Service worker sync queue listener
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ANALYTICS_QUEUE_SIZE') {
        const newSize = e.data.size || 0;
        // Only update if the size actually changed
        setQueueSize(current => current !== newSize ? newSize : current);
      }
    };
    
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

  const handleClick = useCallback(() => {
    if (queueSize > 0) {
      navigator.serviceWorker?.controller?.postMessage({ type: 'REPLAY_ANALYTICS' });
    }
  }, [queueSize]);

  return (
    <button
      type="button"
      className={`net-status ${className}`.trim()}
      data-state={warn ? 'offline' : 'online'}
      aria-live="polite"
      aria-label={aria + (queueSize > 0 ? ' Tap to sync now.' : '')}
      title={aria}
      onClick={handleClick}
      style={{ display: 'inline-flex', gap: '.5rem' }}
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
