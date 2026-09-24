/**
 * Core Web Vitals Reporter Component
 * Reports Core Web Vitals to the analytics endpoint; renders nothing.
 */

'use client';

import { useEffect } from 'react';
import { onCLS, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';
import { internalPost } from '@/lib/internalFetch';

// Send one metric snapshot to the analytics endpoint when telemetry is enabled.
function sendMetric(metric: { name: string; value: number; id: string }) {
  try {
    let shouldSend = false;
    if (typeof process !== 'undefined') {
      const flag = process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY;
      const normalized = typeof flag === 'string' ? flag.toLowerCase() : undefined;
      if (normalized === 'true') {
        shouldSend = true;
      } else if (normalized === 'false') {
        shouldSend = false;
      } else if (process.env.NODE_ENV === 'production') {
        shouldSend = true;
      }
    }
    if (!shouldSend || typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      path: window.location.pathname,
    });
    // Only metric data and a query-free path are collected. User agent and full URLs are excluded.
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon('/api/vitals', new Blob([payload], { type: 'application/json' }));
      if (queued) return;
    }
    internalPost('/api/vitals', JSON.parse(payload)).catch(err => {
      console.warn('Failed to send web vital metric', { metric, error: err });
    });
  } catch (err) {
    console.warn('sendBeacon vitals failed', { metric, error: err });
  }
}

export default function WebVitalsReporter() {
  useEffect(() => {
    const report = (metric: MetricType) => sendMetric({ name: metric.name, value: metric.value, id: metric.id });
    onCLS(report);
    onLCP(report);
    onINP(report);
    onTTFB(report);
  }, []);

  return null;
}
