import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
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
  // Welcome message is intentionally not rendered here; CheckInInfo handles its own welcome copy.

  const pickLocalized = (item: Item, baseKey: 'name' | 'summary'): string => {
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
    location: item.location,
  });

  const nearbyRestaurants = getItemsByCategory('moments').slice(0, 5).map(mapItem);
  const nearbyServices = getItemsByCategory('phones').slice(0, 3).map(mapItem);
  const nearbyAttractions = getItemsByCategory('sightseeing').slice(0, 4).map(mapItem);

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
    redirect(`/api/portal/refresh?next=${next}&failure=${failure}`);
  }

  return (
    <div className="page-container mx-auto max-w-3xl">
      <CheckinViewed locale={eff} />
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-serif italic font-bold mb-2">
          {getDictionary(eff).house?.guideTitle ?? 'House Guide'}
        </h1>
      </div>
      <CheckInInfo
        locale={eff}
        nearbyRestaurants={nearbyRestaurants}
        nearbyServices={nearbyServices}
        nearbyAttractions={nearbyAttractions}
      />
    </div>
  );
}
