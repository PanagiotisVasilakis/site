"use client";
import { useEffect } from 'react';
import { ensureFunnel, trackEvent } from '@/lib/analyticsClient';

export default function CheckinViewed({ locale }: { locale: string }) {
  useEffect(() => {
    try {
      ensureFunnel();
      trackEvent('checkin_viewed', { locale });
    } catch {}
  }, [locale]);
  return null;
}
