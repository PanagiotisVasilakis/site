import { format } from 'date-fns';

import { DAY_PICKER_LOCALES, fill } from '@/components/availability/format';
import { homeFromPriceCents, nextFreeNight } from '@/components/home/homeNights';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { toLocalDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

import BookBar from './BookBar';

/**
 * identity §8 BookBar on Home and Apartment, from the page's F09 availability read (§1.4): the lowest
 * bookable "from" price and, from a fresh calendar only, tonight or the next free night. Without price data
 * (no read, no rate) there is no bar.
 */
export default function AvailabilityBookBar({ availability, locale }: { availability: PublicAvailability | null; locale: Locale }) {
  const t = getDictionary(locale);
  const fromPriceCents = availability ? homeFromPriceCents(availability) : null;
  const free = availability ? nextFreeNight(availability) : null;
  const note = free === null
    ? null
    : free.tonight
      ? t.home.bookBar.freeTonight
      : fill(t.home.bookBar.nextFree, { date: format(toLocalDate(free.date), 'EEE d MMM', { locale: DAY_PICKER_LOCALES[locale] }) });

  return (
    <BookBar
      fromText={t.home.heroPriceFrom}
      price={fromPriceCents === null ? null : formatCentsShort(fromPriceCents, locale)}
      note={note}
      href={`/${locale}/availability`}
      ctaLabel={t.shell.checkDates}
    />
  );
}
