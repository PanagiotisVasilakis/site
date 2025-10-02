"use client";
import { useEffect } from 'react';
import { logger } from '@/lib/logger';

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
    try { document.documentElement.lang = document.documentElement.getAttribute('lang') || 'en'; } catch (err) { logger.warn('Set document lang failed', err); }
    // SW registration & update banner
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          // Request current runtime version
          navigator.serviceWorker.controller?.postMessage({ type: 'REQUEST_VERSION' });
          const showBanner = () => {
            const b = document.getElementById('update-banner');
            if (!b) return;
            const dismissedVer = localStorage.getItem('update-dismissed-version');
            const newVer = b.getAttribute('data-new-version');
            if (dismissedVer && newVer && dismissedVer === newVer) return; // don't re-show for dismissed version
            b.style.display = 'flex';
          };
            if (reg.waiting) {
              showBanner();
            }
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing; if (!nw) return;
              nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) showBanner();
              });
            });
        } catch (err) { logger.error('Service worker registration failed', err); }
      });
    }
    // iOS A2HS tip
  const hasTouch = 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 1 : false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && hasTouch);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || hasTouch;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
    ('standalone' in window.navigator ? (window.navigator as { standalone?: boolean }).standalone === true : false);
    const dismissed = localStorage.getItem('ios-a2hs-dismissed') === '1';
    if (isIOS && !isStandalone && !dismissed) {
      const tip = document.getElementById('ios-a2hs-tip'); if (tip) tip.style.display = 'flex';
    }
    const close = document.getElementById('ios-tip-close');
    close?.addEventListener('click', () => { localStorage.setItem('ios-a2hs-dismissed','1'); const t = document.getElementById('ios-a2hs-tip'); if (t) t.style.display='none'; });
    const reload = document.getElementById('update-reload-btn');
    reload?.addEventListener('click', async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const banner = document.getElementById('update-banner');
        const newV = banner?.getAttribute('data-new-version');
        const newHash = banner?.getAttribute('data-new-hash-full');
        if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        if (newV) localStorage.setItem('app-version', newV);
        if (newHash) localStorage.setItem('app-precache-hash', newHash);
      } catch (err) { logger.error('Update reload handler failed', err); }
      window.location.reload();
    });
    const dismiss = document.getElementById('update-dismiss-btn');
    dismiss?.addEventListener('click', () => {
      const banner = document.getElementById('update-banner');
      if (banner) {
        const ver = banner.getAttribute('data-new-version') || banner.getAttribute('data-old-version');
        if (ver) localStorage.setItem('update-dismissed-version', ver);
        banner.style.display = 'none';
      }
    });
    // Install prompt button
  // Track deferred install prompt event
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => void;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
  
  let deferred: BeforeInstallPromptEvent | null = null;
    const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'none';
    
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      // Validate that the event has the expected install prompt interface
      if (e && typeof (e as BeforeInstallPromptEvent).prompt === 'function' && (e as BeforeInstallPromptEvent).userChoice) {
        deferred = e as BeforeInstallPromptEvent;
  if (btn && !isIOS && isMobile) btn.style.display = 'inline-flex';
      }
    });
    btn?.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
  deferred = null;
      if (btn) btn.style.display = 'none';
    });
    // Listen for version messages from SW
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'RUNTIME_VERSION') {
        const meta = e.data.meta || {};
        const newVersion = meta.version || meta.pkgVersion;
        const newHash: string | undefined = meta.precacheHash;
        if (!newVersion) return;
        const currentEl = document.getElementById('current-version');
        const storedVersion = localStorage.getItem('app-version');
        const storedHash = localStorage.getItem('app-precache-hash');
        const shortNewHash = newHash ? newHash.slice(0,8) : '';
        if (!storedVersion) {
          localStorage.setItem('app-version', newVersion);
          if (newHash) localStorage.setItem('app-precache-hash', newHash);
          if (currentEl) currentEl.textContent = shortNewHash ? `${newVersion} (${shortNewHash})` : newVersion;
          return;
        }
        if (currentEl && !document.getElementById('update-banner')?.style.display) {
          const storedShort = storedHash ? storedHash.slice(0,8) : '';
          currentEl.textContent = storedShort ? `${storedVersion} (${storedShort})` : storedVersion;
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
          if (hashChanged && newHash) {
            banner.setAttribute('data-new-hash', shortNewHash);
            banner.setAttribute('data-new-hash-full', newHash);
          }
          // If user previously dismissed this same new version, keep hidden.
          const dismissedVer = localStorage.getItem('update-dismissed-version');
          if (dismissedVer === newVersion) {
            banner.style.display = 'none';
          }
        }
      }
    });
    // Manual update check
    const manual = document.getElementById('manual-update-check');
    manual?.addEventListener('click', async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
  // Ask SW to refresh precache opportunistically
  reg?.active?.postMessage({ type: 'BG_SYNC_TRIGGER' });
      } catch (err) { logger.error('Manual update check failed', err); }
    });
  }, []);
  return null;
}
