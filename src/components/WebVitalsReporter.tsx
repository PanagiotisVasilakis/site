"use client";
import { onCLS, onFID, onLCP, onINP, onTTFB } from 'web-vitals';
import { logger } from '@/lib/logger';

function send(metric: { name: string; value: number; id: string }) {
  try {
    navigator.sendBeacon('/api/vitals', JSON.stringify(metric));
  } catch (err) { logger.warn('sendBeacon vitals failed', err); }
}

export default function WebVitalsReporter() {
  if (typeof window !== 'undefined') {
    onCLS(send); onFID(send); onLCP(send); onINP(send); onTTFB(send);
  }
  return null;
}