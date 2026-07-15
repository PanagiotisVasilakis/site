"use client";
import { useEffect } from 'react';
import { logger } from '@/lib/logger-client';

export default function PwaManager() {
  useEffect(() => {
      // In dev, aggressively unregister any existing SW (from prior prod build) to avoid intercepting RSC / flight data causing JSON parse errors.
      if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_FORCE_SW_DEV) {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
          // Optional: clear our app's caches
          caches.keys().then(keys => keys.forEach(k => { if (k.startsWith('guest-guide-')) caches.delete(k); }));
        }
        return;
      }
    const eventController = new AbortController();
    const { signal } = eventController;
  try { document.documentElement.lang = document.documentElement.getAttribute('lang') || 'en'; } catch (err) { logger.warn('Set document lang failed', err instanceof Error ? err : { error: String(err) }); }
    // SW registration & update banner
    if ('serviceWorker' in navigator) {
      const registerServiceWorker = async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          // Request current runtime version
          navigator.serviceWorker.controller?.postMessage({ type: 'REQUEST_VERSION' });
          const showBanner = () => {
            const b = document.getElementById('update-banner');
            if (!b) return;
            const dismissedUpdate = localStorage.getItem('update-dismissed-version');
            const updateKey = b.getAttribute('data-update-key');
            if (dismissedUpdate && updateKey && dismissedUpdate === updateKey) return;
            b.style.display = 'flex';
          };
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'REQUEST_VERSION' });
              showBanner();
            }
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing; if (!nw) return;
              nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  nw.postMessage({ type: 'REQUEST_VERSION' });
                  showBanner();
                }
              }, { signal });
            }, { signal });
  } catch (err) { logger.error('Service worker registration failed', err instanceof Error ? err : { error: String(err) }); }
      };
      if (document.readyState === 'complete') {
        void registerServiceWorker();
      } else {
        window.addEventListener('load', () => { void registerServiceWorker(); }, { once: true, signal });
      }
    }
    // iOS A2HS tip
  const hasTouch = 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 1 : false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && hasTouch);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
    ('standalone' in window.navigator ? (window.navigator as { standalone?: boolean }).standalone === true : false);
    const dismissed = localStorage.getItem('ios-a2hs-dismissed') === '1';
    if (isIOS && !isStandalone && !dismissed) {
      const tip = document.getElementById('ios-a2hs-tip'); if (tip) tip.style.display = 'flex';
    }
    const close = document.getElementById('ios-tip-close');
    close?.addEventListener('click', () => { localStorage.setItem('ios-a2hs-dismissed','1'); const t = document.getElementById('ios-a2hs-tip'); if (t) t.style.display='none'; }, { signal });
    const reload = document.getElementById('update-reload-btn');
    reload?.addEventListener('click', async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const banner = document.getElementById('update-banner');
        const newV = banner?.getAttribute('data-new-version');
        const newHash = banner?.getAttribute('data-new-hash-full');
        if (reg?.waiting) {
          const activated = await new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (value: boolean) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout);
              navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
              resolve(value);
            };
            const onControllerChange = () => finish(true);
            const timeout = window.setTimeout(() => finish(false), 8_000);
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          });
          if (!activated) throw new Error('Timed out waiting for the updated service worker to activate');
        }
        if (newV) localStorage.setItem('app-version', newV);
        if (newHash) localStorage.setItem('app-precache-hash', newHash);
        window.location.reload();
  } catch (err) { logger.error('Update reload handler failed', err instanceof Error ? err : { error: String(err) }); }
    }, { signal });
    const dismiss = document.getElementById('update-dismiss-btn');
    dismiss?.addEventListener('click', () => {
      const banner = document.getElementById('update-banner');
      if (banner) {
        const updateKey = banner.getAttribute('data-update-key')
          || banner.getAttribute('data-new-version')
          || banner.getAttribute('data-old-version');
        if (updateKey) localStorage.setItem('update-dismissed-version', updateKey);
        banner.style.display = 'none';
      }
    }, { signal });
    // Listen for version messages from SW
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'RUNTIME_VERSION') {
        const meta = e.data.meta || {};
        const newVersion = meta.version || meta.pkgVersion;
        const newHash: string | undefined = meta.precacheHash;
        if (!newVersion) return;
        const storedVersion = localStorage.getItem('app-version');
        const storedHash = localStorage.getItem('app-precache-hash');
        const shortNewHash = newHash ? newHash.slice(0,8) : '';
        if (!storedVersion) {
          localStorage.setItem('app-version', newVersion);
          if (newHash) localStorage.setItem('app-precache-hash', newHash);
          return;
        }
        const banner = document.getElementById('update-banner');
        const versionChanged = storedVersion !== newVersion;
        const hashChanged = !!newHash && newHash !== storedHash;
        if (banner && (versionChanged || hashChanged)) {
          const span = banner.querySelector('span');
          if (span) {
            const updateTpl = banner.getAttribute('data-t-update-fromto') || 'Update available: {old} → {new}';
            const assetsTpl = banner.getAttribute('data-t-assets-fromto') || 'Assets updated: {old} → {new}';
            if (versionChanged) {
              span.textContent = updateTpl.replace('{old}', storedVersion || '').replace('{new}', newVersion || '');
            } else if (hashChanged) {
              const oldShort = storedHash ? storedHash.slice(0,8) : '';
              span.textContent = assetsTpl.replace('{old}', oldShort || 'old').replace('{new}', shortNewHash || '');
            }
          }
          banner.setAttribute('data-old-version', storedVersion);
          banner.setAttribute('data-new-version', newVersion);
          const updateKey = newHash ? `${newVersion}:${newHash}` : newVersion;
          banner.setAttribute('data-update-key', updateKey);
          if (hashChanged && newHash) {
            banner.setAttribute('data-new-hash', shortNewHash);
            banner.setAttribute('data-new-hash-full', newHash);
          }
          // If user previously dismissed this same new version, keep hidden.
          const dismissedUpdate = localStorage.getItem('update-dismissed-version');
          if (dismissedUpdate === updateKey) {
            banner.style.display = 'none';
          } else {
            banner.style.display = 'flex';
          }
        }
      }
    }, { signal });
    return () => eventController.abort();
  }, []);
  return null;
}
