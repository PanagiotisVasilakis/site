import { AIRBNB_DATE_PARAMS_VERIFIED } from '@/data/contact';
import type { IsoDate } from '@/lib/availability/calendarDate';

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

const AIRBNB_LISTING_HOSTS = new Set(['www.airbnb.com', 'airbnb.com', 'www.airbnb.gr', 'airbnb.gr']);
const AIRBNB_LISTING_PATH = /^\/rooms\/[0-9]+$/;

/** An https Airbnb listing URL: https://www.airbnb.com/rooms/<id> (also airbnb.gr), any query. */
export function isAirbnbListingUrl(value: string): boolean {
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
    && AIRBNB_LISTING_HOSTS.has(url.hostname)
    && AIRBNB_LISTING_PATH.test(url.pathname);
}

/**
 * The listing link for the "Book on Airbnb" button: the listing URL unchanged, plus the stay
 * dates only once AIRBNB_DATE_PARAMS_VERIFIED is set. Check the URL with isAirbnbListingUrl first.
 */
export function airbnbListingHref(listingUrl: string, stay?: { checkIn: IsoDate; checkOut: IsoDate }): string {
  if (!AIRBNB_DATE_PARAMS_VERIFIED || stay === undefined) return listingUrl;
  const url = new URL(listingUrl);
  url.searchParams.set('check_in', stay.checkIn);
  url.searchParams.set('check_out', stay.checkOut);
  return url.toString();
}
