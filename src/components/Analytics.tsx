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
  // (Legacy SyncStatus/NetworkStatus merged into StatusCluster; service worker messages still dispatched for queue size.)
  }, []);
  return null;
}
