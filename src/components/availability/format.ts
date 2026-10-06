// Text formatting shared by the availability page (server) and its planner
// (client). Dates go through date-fns rather than Intl, so the server render
// and the browser hydration produce the same strings.

import { format } from 'date-fns';
import { el, enGB, type DayPickerLocale } from 'react-day-picker/locale';

import type { Locale } from '@/i18n/config';
import { toLocalDate, type IsoDate } from '@/lib/availability/calendarDate';

/** Calendar locales (weeks start on Monday in both). */
export const DAY_PICKER_LOCALES: Record<Locale, DayPickerLocale> = { en: enGB, el };

/** Replaces each `{name}` that has a value; other text is kept as it is. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    return value === undefined ? placeholder : String(value);
  });
}

/** 'Fri 23 Oct 2026' (en) or 'Παρ 23 Οκτ 2026' (el). */
export function formatStayDate(date: IsoDate, locale: Locale): string {
  return format(toLocalDate(date), 'EEE d MMM yyyy', { locale: DAY_PICKER_LOCALES[locale] });
}

/** 'Friday, 23 October 2026' (en) or 'Παρασκευή, 23 Οκτωβρίου 2026' (el). */
export function formatLongDate(date: Date, locale: Locale): string {
  return format(date, 'PPPP', { locale: DAY_PICKER_LOCALES[locale] });
}

/**
 * A stay as a compact range with an en dash, never an arrow: '18–23 Oct',
 * '30 Oct – 2 Nov', '30 Dec 2026 – 2 Jan 2027'.
 */
export function formatStayRange(checkIn: IsoDate, checkOut: IsoDate, locale: Locale): string {
  const options = { locale: DAY_PICKER_LOCALES[locale] };
  const from = toLocalDate(checkIn);
  const to = toLocalDate(checkOut);
  if (checkIn.slice(0, 4) !== checkOut.slice(0, 4)) {
    return `${format(from, 'd MMM yyyy', options)} – ${format(to, 'd MMM yyyy', options)}`;
  }
  if (checkIn.slice(0, 7) !== checkOut.slice(0, 7)) {
    return `${format(from, 'd MMM', options)} – ${format(to, 'd MMM', options)}`;
  }
  return `${format(from, 'd', options)}–${format(to, 'd MMM', options)}`;
}

/** '3 nights' / '1 night' (en), '3 νύχτες' / '1 νύχτα' (el). */
export function nightsLabel(count: number, forms: Readonly<{ one: string; other: string }>, locale: Locale): string {
  return fill(new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other, { count });
}

const nextMonth = (month: number) => (month % 12) + 1;
const previousMonth = (month: number) => ((month + 10) % 12) + 1;

/** The standalone month name: 'April' / 'Apr' (en), 'Απρίλιος' / 'Απρ' (el, nominative). */
function monthName(month: number, locale: Locale, width: 'long' | 'short'): string {
  return format(new Date(2000, month - 1, 1), width === 'long' ? 'LLLL' : 'LLL', { locale: DAY_PICKER_LOCALES[locale] });
}

/**
 * Months (1-12) as ranges that may wrap the year: [4..10] -> 'April–October'
 * ('Apr–Oct' short), [11, 12, 1, 2, 3] -> 'November–March'. Separate runs are
 * joined by commas.
 */
export function describeMonths(months: readonly number[], locale: Locale, width: 'long' | 'short' = 'long'): string {
  const name = (month: number) => monthName(month, locale, width);
  const included = new Set(months.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12));
  if (included.size === 12) return `${name(1)}–${name(12)}`;
  const runs: string[] = [];
  for (let start = 1; start <= 12; start += 1) {
    if (!included.has(start) || included.has(previousMonth(start))) continue;
    let end = start;
    while (included.has(nextMonth(end))) end = nextMonth(end);
    runs.push(start === end ? name(start) : `${name(start)}–${name(end)}`);
  }
  return runs.join(', ');
}
