import { logger } from '@/lib/logger';

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
      const ok = navigator.sendBeacon(endpoint, json);
      if (ok) return;
    }
  } catch (err) {
    logger.warn('sendBeacon analytics failed', err);
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
      logger.warn('SW queue analytics failed', e2);
    }
    logger.error('Analytics POST failed', err);
  }
}

export function trackPageview(pathname: string, locale?: string) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  const loc = locale || pathname.split('/')[1];
  post({ path: pathname, ts: Date.now(), locale: loc });
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  post({ path: location.pathname, ts: Date.now(), locale: location.pathname.split('/')[1], event: { name, props } });
}


