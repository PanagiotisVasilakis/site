import { logger } from '@/lib/logger-client';

// Simple, session-scoped funnel id that persists across pages in a session
// Namespaced so we can have multiple funnels if needed; default is 'portal'
const DEFAULT_FUNNEL_NS = 'portal';

function safeSS(): Storage | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

function genId(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function ensureFunnel(ns = DEFAULT_FUNNEL_NS): string | undefined {
  const ss = safeSS();
  if (!ss) return undefined;
  const key = `funnel:${ns}`;
  let val = ss.getItem(key);
  if (!val) {
    val = genId();
    try { ss.setItem(key, val); } catch {}
  }
  return val;
}

export function resetFunnel(ns = DEFAULT_FUNNEL_NS) {
  const ss = safeSS();
  if (!ss) return;
  const key = `funnel:${ns}`;
  try { ss.removeItem(key); } catch {}
}

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

export function trackPageview(pathname: string, locale?: string) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  const loc = locale || pathname.split('/')[1];
  post({ path: pathname, ts: Date.now(), locale: loc });
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;
  const funnelId = ensureFunnel(DEFAULT_FUNNEL_NS);
  const mergedProps = { ...props } as Record<string, unknown>;
  if (funnelId && mergedProps.funnelId == null) mergedProps.funnelId = funnelId;
  post({ path: location.pathname, ts: Date.now(), locale: location.pathname.split('/')[1], event: { name, props: mergedProps } });
}


