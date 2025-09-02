import { format, parse, isValid, addDays, isSameDay, isAfter, isBefore, startOfDay } from 'date-fns';
import { logger } from './logger';

export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface AvailabilityInfo {
  available: boolean;
  minStay?: number;
  maxStay?: number;
  price?: number;
  reason?: string; // Why unavailable: 'booked', 'blocked', 'maintenance'
}

// Format dates for display
export function formatDateRange(range: DateRange): string {
  if (!range?.from) return '';
  if (!range?.to) return format(range.from, 'MMM d');
  
  const sameMonth = format(range.from, 'MMM yyyy') === format(range.to, 'MMM yyyy');
  const sameYear = format(range.from, 'yyyy') === format(range.to, 'yyyy');
  
  if (sameMonth) {
    return `${format(range.from, 'MMM d')}-${format(range.to, 'd, yyyy')}`;
  } else if (sameYear) {
    return `${format(range.from, 'MMM d')} - ${format(range.to, 'MMM d, yyyy')}`;
  } else {
    return `${format(range.from, 'MMM d, yyyy')} - ${format(range.to, 'MMM d, yyyy')}`;
  }
}

// Format for compact display (mobile)
export function formatDateRangeCompact(range: DateRange): string {
  if (!range?.from) return '';
  if (!range?.to) return format(range.from, 'M/d');
  
  return `${format(range.from, 'M/d')}-${format(range.to, 'M/d')}`;
}

// Parse date string safely
export function parseDate(dateString: string, formatString: string = 'yyyy-MM-dd'): Date | undefined {
  try {
    const parsed = parse(dateString, formatString, new Date());
    return isValid(parsed) ? parsed : undefined;
  } catch (err) {
    logger.warn('Failed to parse date', { dateString, formatString, err });
    return undefined;
  }
}

// Get number of nights between dates
export function getNights(range: DateRange): number {
  if (!range?.from || !range?.to) return 0;
  const diffTime = range.to.getTime() - range.from.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

// Check if date is in the past
export function isPastDate(date: Date): boolean {
  return isBefore(startOfDay(date), startOfDay(new Date()));
}

// Get blocked dates (this would typically come from an API)
export function getBlockedDates(): Date[] {
  // Demo blocked dates - in real app, this would be fetched from API
  const today = new Date();
  return [
    addDays(today, 5),  // 5 days from now
    addDays(today, 6),  // 6 days from now  
    addDays(today, 15), // 2 weeks from now
    addDays(today, 16), 
    addDays(today, 17),
  ];
}

// Check date availability (mock implementation)
export function getDateAvailability(date: Date): AvailabilityInfo {
  // Check if past date
  if (isPastDate(date)) {
    return { available: false, reason: 'Past date' };
  }
  
  // Check blocked dates
  const blockedDates = getBlockedDates();
  if (blockedDates.some(blocked => isSameDay(blocked, date))) {
    return { available: false, reason: 'booked' };
  }
  
  // Demo pricing logic - weekend premium
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const basePrice = 150;
  const weekendMultiplier = 1.3;
  
  return {
    available: true,
    minStay: isWeekend ? 2 : 1,
    maxStay: 14,
    price: Math.round(basePrice * (isWeekend ? weekendMultiplier : 1))
  };
}

// Validate date range
export function validateDateRange(range: DateRange): { valid: boolean; error?: string } {
  if (!range?.from) {
    return { valid: false, error: 'Please select a check-in date' };
  }
  
  if (isPastDate(range.from)) {
    return { valid: false, error: 'Check-in date cannot be in the past' };
  }
  
  if (!range?.to) {
    return { valid: false, error: 'Please select a check-out date' };
  }
  
  if (!isAfter(range.to, range.from)) {
    return { valid: false, error: 'Check-out must be after check-in' };
  }
  
  const nights = getNights(range);
  if (nights < 1) {
    return { valid: false, error: 'Minimum stay is 1 night' };
  }
  
  if (nights > 30) {
    return { valid: false, error: 'Maximum stay is 30 nights' };
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
