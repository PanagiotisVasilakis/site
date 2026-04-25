"use client";

import { useEffect, useState, type ComponentType } from 'react';

interface RuntimeManagers {
  PwaManager: ComponentType;
  Analytics: ComponentType;
}

function scheduleIdle(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  let timeoutId: number | null = null;
  let idleId: number | null = null;
  let cancelled = false;
  const w = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  const run = () => {
    if (cancelled) return;
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(() => {
        if (!cancelled) callback();
      }, { timeout: 2500 });
    } else {
      timeoutId = globalThis.setTimeout(callback, 1200) as unknown as number;
    }
  };

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener('load', run);
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    if (idleId !== null) w.cancelIdleCallback?.(idleId);
  };
}

export default function DeferredRuntimeManagers() {
  const [managers, setManagers] = useState<RuntimeManagers | null>(null);

  useEffect(() => {
    return scheduleIdle(() => {
      void Promise.all([
        import('@/components/PwaManager'),
        import('@/components/Analytics'),
      ]).then(([pwa, analytics]) => {
        setManagers({
          PwaManager: pwa.default,
          Analytics: analytics.default,
        });
      });
    });
  }, []);

  if (!managers) return null;

  const { PwaManager, Analytics } = managers;
  return (
    <>
      <PwaManager />
      <Analytics />
    </>
  );
}
