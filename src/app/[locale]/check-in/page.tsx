import Link from 'next/link';
import { redirect } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { getGuestSessionFromCookies, hasVerifiedBookingSession } from '@/lib/guestSession';
import CheckinViewed from '@/components/analytics/CheckinViewed';
import CheckInForm from '@/components/CheckInForm';
import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';

export const metadata = {
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

// Booking-scoped session guard for /check-in
export default async function CheckInPage({ params }: { params: Promise<{ locale: string }> }) {
  const flags = getFeatureFlags();
  if (!flags.checkinEnabled) return notFound();
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const dict = getDictionary(eff);

  const session = await getGuestSessionFromCookies();
  if (!hasVerifiedBookingSession(session)) {
    const failMsg = encodeURIComponent('Please verify your booking to continue');
    const failure = encodeURIComponent(`/${eff}/guest?flash=${failMsg}`);
    const next = encodeURIComponent(`/${eff}/check-in`);
    redirect(`/api/portal/refresh?next=${next}&failure=${failure}`);
  }

  return (
    <div className="page-container mx-auto max-w-md">
      <CheckinViewed locale={eff} />
      <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--fg-default)' }}>{dict.checkin?.title || 'Check‑in'}</h1>
      <CheckInForm locale={eff} />
      <div className="mt-4">
        <Link href={`/${eff}/guest`} className="btn-outline">{(dict.ui?.back || 'Back')}: {(dict.portal?.signInTitle || 'Guest Portal')}</Link>
      </div>
    </div>
  );
}
