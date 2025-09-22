"use client";
import React, { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ensureFunnel, trackEvent } from '@/lib/analyticsClient';
import { getDictionary, type Locale } from '@/i18n';

export default function StartBookingCTA({ locale }: { locale: Locale }) {
  const router = useRouter();
  const search = useSearchParams();
  const dict = getDictionary(locale);

  const onClick = useCallback(async () => {
    const ref = search?.get('ref') || (typeof document !== 'undefined' ? document.referrer : '') || undefined;
    // Route to home page where the date selection lives
    const path = `/${locale}`;
    const target = ref ? `${path}?ref=${encodeURIComponent(ref)}` : path;

    try {
      ensureFunnel();
      // best-effort, no await
  trackEvent('no_booking_cta_clicked', { ref, from: 'guest' });
    } finally {
      router.push(target);
    }
  }, [router, search, locale]);

  return (
    <button type="button" className="btn-outline w-full" onClick={onClick}>
      {(dict.portal?.noBookingYet || 'No booking yet?')} {(dict.portal?.ctaStartBooking || 'Start here')}
    </button>
  );
}
