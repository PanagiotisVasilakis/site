"use client";
import { useEffect } from 'react';
import { ensureFunnel, trackEvent } from '@/lib/analyticsClient';

export default function PortalOpened({ locale }: { locale: string }) {
  useEffect(() => {
    try {
      ensureFunnel();
      trackEvent('portal_opened', { locale });
    } catch {}
  }, [locale]);
  return null;
}
