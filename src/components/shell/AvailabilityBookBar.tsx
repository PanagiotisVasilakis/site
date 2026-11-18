import { fill, formatIsoDate } from '@/components/availability/format';
import { nextFreeNight } from '@/components/home/homeNights';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

import BookBar from './BookBar';

/**
 * identity §8 BookBar on Home and Apartment, from the page's F09 availability read (§1.4): tonight or the next
 * free night, from a fresh calendar only, with the "Check dates" link. Without that (no read, no fresh calendar,
 * no free night) there is no bar. The bar shows no price.
 */
export default function AvailabilityBookBar({ availability, locale }: { availability: PublicAvailability | null; locale: Locale }) {
  const t = getDictionary(locale);
  const free = availability ? nextFreeNight(availability) : null;
  const note = free === null
    ? null
    : free.tonight
      ? t.home.bookBar.freeTonight
      : fill(t.home.bookBar.nextFree, { date: formatIsoDate(free.date, 'EEE d MMM', locale) });

  return <BookBar note={note} href={`/${locale}/availability`} ctaLabel={t.shell.checkDates} />;
}
