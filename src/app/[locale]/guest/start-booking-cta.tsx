"use client";
import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ensureFunnel, trackEvent } from '@/lib/analyticsClient';
import { getDictionary } from '@/i18n';

export default function StartBookingCTA({ locale }: { locale: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const dict = getDictionary(locale as any);

  const onClick = useCallback(async () => {
    const ref = search?.get('ref') || (typeof document !== 'undefined' ? document.referrer : '') || undefined;
    const path = `/${locale}/booking/start`;
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
      {(dict.portal?.noBookingYet || 'No booking yet?')} {(dict.portal?.ctaStartBooking || 'Start booking')}
    </button>
  );
}
