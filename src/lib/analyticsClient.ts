import { logger } from '@/lib/logger-client';

function dntEnabled(): boolean {
  try {
    const nav = navigator as Navigator & { doNotTrack?: string };
    const win = window as Window & { doNotTrack?: string };
    return nav.doNotTrack === '1' || win.doNotTrack === '1';
  } catch {
    return false;
  }
}

async function post(body: unknown) {
  const endpoint = '/api/analytics';
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(endpoint, new Blob([json], { type: 'application/json' }));
      if (ok) return;
    }
  } catch (err) {
    logger.warn('sendBeacon analytics failed', err instanceof Error ? err : { error: String(err) });
  }
  try {
    await fetch(endpoint, { method: 'POST', body: json, headers: { 'content-type': 'application/json' }, keepalive: true });
  } catch (err) {
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'QUEUE_ANALYTICS', body: json });
        return;
      }
    } catch (e2) {
      logger.warn('SW queue analytics failed', e2 instanceof Error ? e2 : { error: String(e2) });
    }
    logger.error('Analytics POST failed', err instanceof Error ? err : { error: String(err) });
  }
}

function analyticsEnvelope(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    ts: Date.now(),
    eventId: globalThis.crypto.randomUUID(),
  };
}

export function trackPageview(pathname: string) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  post(analyticsEnvelope({ path: pathname, locale: pathname.split('/')[1] }));
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  post(analyticsEnvelope({
    path: location.pathname,
    locale: location.pathname.split('/')[1],
    event: { name, props },
  }));
}
