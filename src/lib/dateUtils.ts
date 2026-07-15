import { format, parse, isValid, isAfter, isBefore, startOfDay } from 'date-fns';
import { logger } from './logger-client';

export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

type DateLocale = 'en' | 'el';

const localeCode = (locale: DateLocale) => locale === 'el' ? 'el-GR' : 'en-US';

// Format dates for display
export function formatDateRange(range: DateRange, locale: DateLocale = 'en'): string {
  if (!range?.from) return '';
  const formatter = new Intl.DateTimeFormat(localeCode(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (!range?.to) return formatter.format(range.from);
  return formatter.formatRange(range.from, range.to);
}

// Parse date string safely
function parseDate(dateString: string, formatString: string = 'yyyy-MM-dd'): Date | undefined {
  try {
    const parsed = parse(dateString, formatString, new Date());
    return isValid(parsed) ? parsed : undefined;
  } catch (err) {
    logger.warn('Failed to parse date', {
      dateString,
      formatString,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// Get number of nights between dates
export function getNights(range: DateRange): number {
  if (!range?.from || !range?.to) return 0;
  const fromDay = Date.UTC(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const toDay = Date.UTC(range.to.getFullYear(), range.to.getMonth(), range.to.getDate());
  return Math.max(0, Math.round((toDay - fromDay) / (1000 * 60 * 60 * 24)));
}

// Check if date is in the past
function isPastDate(date: Date): boolean {
  return isBefore(startOfDay(date), startOfDay(new Date()));
}

// Get blocked dates (would typically come from an API; return none for full availability)
export function getBlockedDates(): Date[] {
  return [];
}

// Validate date range
export function validateDateRange(range: DateRange, locale: DateLocale = 'en'): { valid: boolean; error?: string } {
  const errors = locale === 'el' ? {
    missingCheckIn: 'Παρακαλώ επιλέξτε ημερομηνία άφιξης',
    pastCheckIn: 'Η ημερομηνία άφιξης δεν μπορεί να είναι στο παρελθόν',
    missingCheckOut: 'Παρακαλώ επιλέξτε ημερομηνία αναχώρησης',
    invalidOrder: 'Η αναχώρηση πρέπει να είναι μετά την άφιξη',
    minimumStay: 'Η ελάχιστη διαμονή είναι 1 νύχτα',
    maximumStay: 'Η μέγιστη διαμονή είναι 30 νύχτες',
  } : {
    missingCheckIn: 'Please select a check-in date',
    pastCheckIn: 'Check-in date cannot be in the past',
    missingCheckOut: 'Please select a check-out date',
    invalidOrder: 'Check-out must be after check-in',
    minimumStay: 'Minimum stay is 1 night',
    maximumStay: 'Maximum stay is 30 nights',
  };
  if (!range?.from) {
    return { valid: false, error: errors.missingCheckIn };
  }
  
  if (isPastDate(range.from)) {
    return { valid: false, error: errors.pastCheckIn };
  }
  
  if (!range?.to) {
    return { valid: false, error: errors.missingCheckOut };
  }
  
  if (!isAfter(range.to, range.from)) {
    return { valid: false, error: errors.invalidOrder };
  }
  
  const nights = getNights(range);
  if (nights < 1) {
    return { valid: false, error: errors.minimumStay };
  }
  
  if (nights > 30) {
    return { valid: false, error: errors.maximumStay };
  }
  
  return { valid: true };
}

// Convert date range to URL params
export function dateRangeToParams(range: DateRange): URLSearchParams {
  const params = new URLSearchParams();
  if (range?.from) {
    params.set('checkin', format(range.from, 'yyyy-MM-dd'));
  }
  if (range?.to) {
    params.set('checkout', format(range.to, 'yyyy-MM-dd'));
  }
  return params;
}

// Parse date range from URL params
export function dateRangeFromParams(params: URLSearchParams): DateRange {
  const checkin = params.get('checkin');
  const checkout = params.get('checkout');
  
  return {
    from: checkin ? parseDate(checkin) : undefined,
    to: checkout ? parseDate(checkout) : undefined
  };
}
