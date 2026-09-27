import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { type Locale, normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { getItemsByCategory, pickLocale } from '@/lib/data';
import type { Item } from '@/data/schemas';
import { GUEST_REFRESH_COOKIE, getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import CheckInInfo from '@/components/CheckInInfo';
import { notFound } from 'next/navigation';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff: Locale = normalizeLocale(locale);
  return {
    robots: { index: false, follow: false },
    title: getDictionary(eff).checkinInfo.pageTitle,
  };
}
export const dynamic = 'force-dynamic';

// Booking-scoped session guard for /check-in
export default async function CheckInPage({ params }: { params: Promise<{ locale: string }> }) {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) return notFound();
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  // CheckInInfo owns the guest-facing layout and welcome copy.

  const mapItem = (item: Item) => ({
    id: item.id,
    name: pickLocale(item, 'name', eff) ?? item.name,
    summary: pickLocale(item, 'summary', eff),
    slug: item.slug,
    rating: item.rating,
      tags: item.tags,
    location: item.location,
    phone: item.phone,
    phones: item.phones,
      address: pickLocale(item, 'address', eff),
    website: item.website,
    directionsUrl: item.directionsUrl,
    sourceUrls: item.sourceUrls,
  });

  const nearbyRestaurants = getItemsByCategory('moments').map(mapItem);
  const nearbyServices = getItemsByCategory('phones').map(mapItem);

  const session = await getVerifiedGuestSessionFromCookies();
  if (!session) {
    const failurePath = `/${eff}/guest?flash=session_required`;
    const cookieStore = await cookies();
    if (!cookieStore.get(GUEST_REFRESH_COOKIE)?.value) {
      redirect(failurePath);
    }

    const failure = encodeURIComponent(failurePath);
    const next = encodeURIComponent(`/${eff}/check-in`);
    redirect(`/${eff}/portal/refresh?next=${next}&failure=${failure}`);
  }

  return (
    <div className="page-container checkin-page mx-auto max-w-[1200px]">
      <CheckInInfo
        locale={eff}
        nearbyRestaurants={nearbyRestaurants}
        nearbyServices={nearbyServices}
      />
    </div>
  );
}
