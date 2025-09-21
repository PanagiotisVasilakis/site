"use server";
import { redirect } from 'next/navigation';
import { locales, defaultLocale } from '@/i18n/config';

type ConfirmPayload = {
  phone: string;
  origin?: 'GR' | 'ABROAD';
  booking: {
    id?: string;
    reference?: string;
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
    lastName?: string;
  };
  remember?: boolean;
};

/**
 * Server action to confirm on-site booking.
 * Relies on API to set cookies and returns a 302 redirect to /{locale}/check-in?bookingId=…
 */
export async function confirmOnsiteBooking(locale: string, payload: ConfirmPayload) {
  const eff = (locales as readonly string[]).includes(locale) ? locale : (defaultLocale as string);
  // If booking id is present, prefer the new confirm endpoint for a clean redirect + session issuance
  if (payload.booking?.id) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/bookings/${encodeURIComponent(payload.booking.id)}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'manual',
    });
    const loc = res.headers.get('location') || res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && loc) {
      redirect(loc);
    }
  }

  // Fallback to legacy endpoint that can also mint session and redirect
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/portal/onsite/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  // Expect a 302 with Location header
  const loc = res.headers.get('location') || res.headers.get('Location');
  if (res.status >= 300 && res.status < 400 && loc) {
    redirect(loc);
  }
  // Fallback: just redirect to locale check-in
  redirect(`/${eff}/check-in`);
}
