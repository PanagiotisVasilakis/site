// Runs `callback` once the page has loaded and the main thread is idle (docs/design/identity.md §5.6):
// after `load`, requestIdleCallback with a 2.5 s timeout, or setTimeout(1200) where there is no
// requestIdleCallback (Safari). Returns a cancel function; after it, the callback never runs.
export function scheduleIdle(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
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
      timeoutId = globalThis.setTimeout(callback, 1200);
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
