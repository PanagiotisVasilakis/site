import type { Locale } from '@/i18n/config';
import { getApartmentContent } from '@/data/apartmentData';

export const APARTMENT_LOCATION: [number, number] = [22.094364, 37.040635];

export type MapMarkerType =
  | 'apartment'
  | 'restaurant'
  | 'service'
  | 'attraction'
  | 'sightseeing'
  | 'beach'
  | 'shop'
  | 'cafe'
  | 'bar'
  | 'park'
  | 'police'
  | 'city-center';

export interface MapLocation {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  phones?: string[];
  website?: string;
  directionsUrl?: string;
  coordinates: [number, number];
  category: string;
  markerType: MapMarkerType;
  href?: string;
  price?: string;
  rating?: number;
  sourceUrls?: string[];
}

export interface CategoryMapItem {
  id: string;
  name: string;
  name_en?: string;
  name_el?: string;
  summary?: string;
  summary_en?: string;
  summary_el?: string;
  description?: string;
  description_en?: string;
  description_el?: string;
  address?: string;
  address_en?: string;
  address_el?: string;
  phone?: string;
  phones?: string[];
  website?: string;
  directionsUrl?: string;
  sourceUrls?: string[];
  rating?: number;
  price?: string;
  priceLevel?: number;
  tags?: string[];
  location?: { lat: number; lng: number };
  slug?: string;
}

function pickLocalized(item: CategoryMapItem, key: 'name' | 'summary' | 'description' | 'address', locale: Locale): string | undefined {
  const localized = item[`${key}_${locale}` as keyof CategoryMapItem];
  const english = item[`${key}_en` as keyof CategoryMapItem];
  const base = item[key];
  if (typeof localized === 'string' && localized.trim()) return localized;
  if (typeof base === 'string' && base.trim()) return base;
  if (typeof english === 'string' && english.trim()) return english;
  return undefined;
}

function markerTypeForItem(item: CategoryMapItem, categorySlug: string): MapMarkerType {
  const tags = new Set((item.tags ?? []).map(tag => tag.toLowerCase()));
  const name = item.name.toLowerCase();

  if (categorySlug === 'phones') {
    return name.includes('police') ? 'police' : 'service';
  }

  if (tags.has('beach')) return 'beach';
  if (tags.has('bar') || tags.has('nightlife')) return 'bar';
  if (tags.has('cafe') || tags.has('brunch')) return 'cafe';
  if (tags.has('restaurant') || tags.has('food')) return 'restaurant';
  if (tags.has('park') || tags.has('outdoor') || tags.has('railway')) return 'park';
  if (tags.has('site') || tags.has('sightseeing') || tags.has('archaeology')) return 'sightseeing';
  if (tags.has('museum') || tags.has('culture') || tags.has('history')) return 'attraction';

  return categorySlug === 'sightseeing' ? 'sightseeing' : 'attraction';
}

export function getApartmentMapLocation(locale: Locale = 'en'): MapLocation {
  const apartment = getApartmentContent(locale);
  return {
    id: 'apartment',
    name: apartment.shortName,
    description: apartment.description,
    address: 'Archimidous 21, Kalamata 24100, Greece',
    phone: '+30 695 581 0051',
    directionsUrl: 'https://maps.app.goo.gl/9vqnjXJqQeakxdBx8',
    coordinates: APARTMENT_LOCATION,
    category: 'apartment',
    markerType: 'apartment',
    price: `€${apartment.pricing.basePrice}/night`,
  };
}

export function createMapLocationFromItem(
  item: CategoryMapItem,
  categorySlug: string,
  locale: Locale | string
): MapLocation | null {
  if (!item.location || typeof item.location.lat !== 'number' || typeof item.location.lng !== 'number') {
    return null;
  }

  const eff: Locale = locale === 'el' ? 'el' : 'en';
  const name = pickLocalized(item, 'name', eff) ?? item.name;
  const description = pickLocalized(item, 'summary', eff) ?? pickLocalized(item, 'description', eff);
  const address = pickLocalized(item, 'address', eff);
  const phones = item.phones?.length ? item.phones : item.phone ? [item.phone] : undefined;

  return {
    id: item.id,
    name,
    description,
    address,
    phone: item.phone ?? phones?.[0],
    phones,
    website: item.website,
    directionsUrl: item.directionsUrl,
    coordinates: [item.location.lng, item.location.lat],
    category: categorySlug,
    markerType: markerTypeForItem(item, categorySlug),
    rating: item.rating,
    price: item.price ?? (item.priceLevel ? '€'.repeat(item.priceLevel) : undefined),
    href: `/${eff}/${categorySlug}/${item.slug || item.id}`,
    sourceUrls: item.sourceUrls,
  };
}
