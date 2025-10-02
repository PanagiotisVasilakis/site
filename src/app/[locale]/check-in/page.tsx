import Link from 'next/link';
import { redirect } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { getGuestSessionFromCookies, hasVerifiedBookingSession } from '@/lib/guestSession';
import CheckinViewed from '@/components/analytics/CheckinViewed';
import CheckInInfo from '@/components/CheckInInfo';
import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Check-in Information',
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
    const failMsg = encodeURIComponent('Please sign in to access check-in information');
    const failure = encodeURIComponent(`/${eff}/guest?flash=${failMsg}`);
    const next = encodeURIComponent(`/${eff}/check-in`);
    redirect(`/api/portal/refresh?next=${next}&failure=${failure}`);
  }

  return (
    <div className="page-container mx-auto max-w-3xl">
      <CheckinViewed locale={eff} />
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-accent)' }}>
          House Guide
        </h1>
        <p className="text-[color:var(--fg-muted)]">
          {dict.checkinInfo?.welcomeMessage || 'Everything you need to know for your stay'}
        </p>
      </div>
      <CheckInInfo locale={eff} />
    </div>
  );
}
