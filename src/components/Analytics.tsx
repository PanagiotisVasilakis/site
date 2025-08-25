"use client";
import { useEffect } from 'react';

// Lightweight Plausible-like script loader (placeholder) respecting DNT
export default function Analytics() {
  useEffect(() => {
  const navAny = navigator as Navigator & { doNotTrack?: string };
  const winAny = window as Window & { doNotTrack?: string };
  const dnt = navAny.doNotTrack === '1' || winAny.doNotTrack === '1';
    if (dnt) return;
    if (document.getElementById('analytics-script')) return;
    const s = document.createElement('script');
    s.id = 'analytics-script';
    s.defer = true;
    // Placeholder src; user to replace with actual analytics endpoint
    s.src = '/analytics.js'; // Could be proxied self-hosted plausible
    document.head.appendChild(s);
    // Listen for queue size updates from SW
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'ANALYTICS_QUEUE_SIZE') {
        const el = document.getElementById('analytics-queue-indicator');
        if (!el) return;
        if (e.data.size > 0) {
          el.textContent = `Analytics queue: ${e.data.size}`;
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
    // Add click to flush if indicator visible
    const el = document.getElementById('analytics-queue-indicator');
    el?.addEventListener('click', () => {
      navigator.serviceWorker?.controller?.postMessage({ type: 'REPLAY_ANALYTICS' });
    });
  }, []);
  return null;
}
