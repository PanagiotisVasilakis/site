"use client";
import { useEffect } from 'react';
import internalFetch from '@/lib/internalFetchClient';
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
    // SW registration & update banner
    if ('serviceWorker' in navigator) {
      const registerServiceWorker = async () => {
        try {
          // Versioned script URL: every build installs a new worker (and cache).
          let scriptUrl = '/sw.js';
          try {
            const res = await internalFetch('/version.json', { cache: 'no-store' });
            if (res.ok) {
              const meta = await res.json() as { version?: string; build?: string };
              if (meta.version && meta.build) {
                scriptUrl = `/sw.js?v=${encodeURIComponent(meta.version)}&build=${encodeURIComponent(meta.build)}`;
              }
            }
          } catch { /* offline: keep the current registration's script */ }
          const reg = await navigator.serviceWorker.register(scriptUrl);
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
        const newBuild = banner?.getAttribute('data-new-build');
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
        if (newBuild) localStorage.setItem('app-build', newBuild);
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
        const newVersion: string | undefined = meta.version;
        const newBuild: string | undefined = meta.build;
        if (!newVersion) return;
        const storedVersion = localStorage.getItem('app-version');
        const storedBuild = localStorage.getItem('app-build');
        const shortNewBuild = newBuild ? newBuild.slice(0,8) : '';
        if (!storedVersion) {
          localStorage.setItem('app-version', newVersion);
          if (newBuild) localStorage.setItem('app-build', newBuild);
          return;
        }
        const banner = document.getElementById('update-banner');
        const versionChanged = storedVersion !== newVersion;
        const buildChanged = !!newBuild && newBuild !== storedBuild;
        if (banner && (versionChanged || buildChanged)) {
          const span = banner.querySelector('span');
          if (span) {
            const updateTpl = banner.getAttribute('data-t-update-fromto') || 'Update available: {old} → {new}';
            const assetsTpl = banner.getAttribute('data-t-assets-fromto') || 'Assets updated: {old} → {new}';
            if (versionChanged) {
              span.textContent = updateTpl.replace('{old}', storedVersion || '').replace('{new}', newVersion || '');
            } else if (buildChanged) {
              const oldShort = storedBuild ? storedBuild.slice(0,8) : '';
              span.textContent = assetsTpl.replace('{old}', oldShort || 'old').replace('{new}', shortNewBuild || '');
            }
          }
          banner.setAttribute('data-old-version', storedVersion);
          banner.setAttribute('data-new-version', newVersion);
          const updateKey = newBuild ? `${newVersion}:${newBuild}` : newVersion;
          banner.setAttribute('data-update-key', updateKey);
          if (buildChanged && newBuild) banner.setAttribute('data-new-build', newBuild);
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
