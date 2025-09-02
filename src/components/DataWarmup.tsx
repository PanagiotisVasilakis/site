"use client";
import { useEffect } from 'react';
import { internalFetch } from '@/lib/internalFetchClient';
import { logger } from '@/lib/logger';

/**
 * DataWarmup triggers an initial fetch of core JSON endpoints so the service worker
 * (once activated) can cache them, improving first-offline experience even if activation
 * races with user navigation. Lightweight (single network round trip + silent).
 */
export default function DataWarmup() {
  useEffect(() => {
  interface CategoryLite { id: string; slug: string; title?: string; count?: number }
  const run = async () => {
      try {
  const res = await internalFetch('/api/categories', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const cats = Array.isArray(json?.categories) ? json.categories : [];
        // Opportunistically fetch each category list (first 3 to limit overhead)
        await Promise.all(
          (cats as CategoryLite[]).slice(0,3).map((c) => internalFetch(`/api/categories/${c.id}/items`, { headers: { accept: 'application/json' }, cache: 'no-store' }).catch((err)=>{ logger.warn('Warmup category list failed', err); }))
        );
        // Schedule deeper warmup (remaining lists + item details) after first user interaction & idle.
        setupDeepWarmup(cats as CategoryLite[]);
      } catch (err) { logger.error('DataWarmup initial fetch failed', err); }
    };
    const schedule = (cb: () => void) => {
      try {
        const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
        if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 400 }); else setTimeout(cb, 400);
      } catch { setTimeout(cb, 400); }
    };
    schedule(run);
    return () => {};
  }, []);
  return null;
}

function setupDeepWarmup(cats: { id: string }[]) {
  let armed = false;
  const arm = () => {
    if (armed) return; armed = true;
    const exec = () => {
      // Use requestIdleCallback when available
      const doWork = async () => {
        try {
          for (const c of cats) {
            const listRes = await internalFetch(`/api/categories/${c.id}/items`, { headers: { accept: 'application/json' }, cache: 'no-store' });
            if (!listRes.ok) continue;
            const listJson = await listRes.json();
            const items = Array.isArray(listJson?.items) ? listJson.items : [];
            // Skip first 2 (already prewarmed by SW) and limit additional detail fetches
            for (const item of items.slice(2, 12)) {
              if (!item?.slug) continue;
              internalFetch(`/api/categories/${c.id}/items/${item.slug}`, { headers: { accept: 'application/json' }, cache: 'no-store' }).catch((err)=>{ logger.warn('Warmup item detail failed', err); });
            }
          }
        } catch (err) { logger.error('DataWarmup deep fetch failed', err); }
      };
      try {
        const g = self as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
        if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(doWork, { timeout: 1500 }); else setTimeout(doWork, 1500);
      } catch { setTimeout(doWork, 1500); }
      detach();
    };
    window.addEventListener('pointerdown', exec, { once: true });
    window.addEventListener('keydown', exec, { once: true });
    window.addEventListener('scroll', exec, { once: true, passive: true });
  };
  const detach = () => {
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
    window.removeEventListener('scroll', arm);
  };
  arm();
}