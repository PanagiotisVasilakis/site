import { BOOKING_COM_LISTING_URL } from '@/data/contact';

export function telHref(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^+0-9]/g, '');
  return `tel:${digits}`;
}

export function mapsHref(address?: string, lat?: number, lng?: number): string | undefined {
  if (!address && (lat == null || lng == null)) return undefined;
  if (lat != null && lng != null) return `https://maps.google.com/?q=${lat},${lng}`;
  return `https://maps.google.com/?q=${encodeURIComponent(address!)}`;
}

const BOOKING_COM_LISTING_HOSTS = new Set(['www.booking.com', 'booking.com']);
const BOOKING_COM_LISTING_PATH = /^\/Share-[A-Za-z0-9_-]+$/;

/** An https Booking.com listing share link: https://www.booking.com/Share-<token> (also booking.com), any query or hash. */
export function isBookingComListingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.port === ''
    && BOOKING_COM_LISTING_HOSTS.has(url.hostname)
    && BOOKING_COM_LISTING_PATH.test(url.pathname);
}

/**
 * The Booking.com listing link for the 'Book on Booking.com' button and the how-to-book step: the
 * configured link while it passes isBookingComListingUrl, otherwise undefined (nothing is shown).
 * It carries no stay dates: Booking.com date parameters are unverified.
 */
export function bookingComHref(): string | undefined {
  return isBookingComListingUrl(BOOKING_COM_LISTING_URL) ? BOOKING_COM_LISTING_URL : undefined;
}
