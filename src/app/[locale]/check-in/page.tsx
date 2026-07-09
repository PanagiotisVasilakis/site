import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { locales, type Locale } from '@/i18n/config';
import { getItemsByCategory } from '@/lib/data';
import type { Item } from '@/data/schemas';
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
  // CheckInInfo owns the guest-facing layout and welcome copy.

  const pickLocalized = (item: Item, baseKey: 'name' | 'summary' | 'address'): string => {
    const localeKey = `${baseKey}_${eff}` as keyof Item;
    const englishKey = `${baseKey}_en` as keyof Item;
    const greekKey = `${baseKey}_el` as keyof Item;
    const candidate = item[localeKey];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    const localeFallback = eff === 'el' ? item[greekKey] : item[englishKey];
    if (typeof localeFallback === 'string' && localeFallback.trim()) return localeFallback;
    const baseValue = item[baseKey];
    return typeof baseValue === 'string' ? baseValue : '';
  };

  const mapItem = (item: Item) => ({
    id: item.id,
    name: pickLocalized(item, 'name'),
    summary: pickLocalized(item, 'summary') || undefined,
    slug: item.slug,
    rating: item.rating,
    priceLevel: item.priceLevel,
      tags: item.tags,
    location: item.location,
    phone: item.phone,
    phones: item.phones,
      address: pickLocalized(item, 'address') || undefined,
    website: item.website,
    directionsUrl: item.directionsUrl,
    sourceUrls: item.sourceUrls,
  });

  const nearbyRestaurants = getItemsByCategory('moments').map(mapItem);
  const nearbyServices = getItemsByCategory('phones').map(mapItem);

  const session = await getGuestSessionFromCookies();
  if (!hasVerifiedBookingSession(session)) {
    const failMsg = encodeURIComponent('Please sign in to access check-in information');
    const failurePath = `/${eff}/guest?flash=${failMsg}`;
    const cookieStore = await cookies();
    if (!cookieStore.get('guest_rt')?.value) {
      redirect(failurePath);
    }

    const failure = encodeURIComponent(failurePath);
    const next = encodeURIComponent(`/${eff}/check-in`);
    redirect(`/${eff}/portal/refresh?next=${next}&failure=${failure}`);
  }

  return (
    <div className="page-container checkin-page mx-auto max-w-[1200px]">
      <CheckinViewed locale={eff} />
      <CheckInInfo
        locale={eff}
        nearbyRestaurants={nearbyRestaurants}
        nearbyServices={nearbyServices}
      />
    </div>
  );
}
