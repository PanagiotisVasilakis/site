import type { IconName } from '@/components/icons/Icon';
import { APARTMENT_LOCATION } from '@/data/mapLocations';
import type { Category, Item } from '@/data/schemas';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries';
import { mapsHref } from '@/lib/contactLinks';
import { pickLocale } from '@/lib/localize';

/**
 * One guide place as the GuideCard, the detail page and the map list show it (identity §8 GuideCard,
 * §9.5). Built on the server from the content items, localized, with the straight-line distance from the
 * apartment (`APARTMENT_LOCATION`, src/data/mapLocations.ts) already formatted for the locale.
 */
export interface GuideEntry {
  id: string;
  slug: string;
  categorySlug: string;
  /** The favourites store id (`${categorySlug}:${id}`, unchanged so existing saves survive). */
  favoriteId: string;
  href: string;
  name: string;
  summary?: string;
  description?: string;
  descriptionTitle?: string;
  tags: string[];
  /** The olive meta label: the first tag with a label, else the category title. */
  categoryLabel: string;
  /** The art tile's icon (§7.3). */
  icon: IconName;
  /** A licensed 16:10 photo; absent means the art tile. */
  photo?: string;
  photoPosition?: string;
  address?: string;
  phones: string[];
  website?: string;
  directionsUrl?: string;
  location?: { lat: number; lng: number };
  distanceKm?: number;
  /** "1.5 km" / "1,5 χλμ."; absent without coordinates. */
  distanceText?: string;
}

/**
 * §7.3: photos that must not be shown as a card or hero image. viktoria-karelia-hero.jpg is almost black
 * (L = .018) and the SOS illustration is not used, so both get the art tile.
 */
const ART_TILE_PHOTOS = new Set(['/moments/viktoria-karelia-hero.jpg', '/phones/sos-hero.webp']);

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle (haversine) distance in km between two [lng, lat] points. */
export function straightLineKm([lng1, lat1]: readonly [number, number], [lng2, lat2]: readonly [number, number]): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** "1.5 km" from 1 km up (one decimal), "650 m" below (to 10 m), in the locale's unit style. */
export function formatDistance(km: number, locale: Locale): string {
  if (km < 1) {
    const metres = Math.max(10, Math.round(km * 100) * 10);
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(metres);
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(km);
}

function iconFor(tags: readonly string[], categorySlug: string): IconName {
  if (categorySlug === 'phones') return 'phone';
  if (tags.some((tag) => ['museum', 'culture', 'history', 'archaeology'].includes(tag))) return 'museum';
  if (tags.includes('beach')) return 'beach';
  if (tags.some((tag) => ['restaurant', 'food', 'cafe', 'brunch'].includes(tag))) return 'fork';
  return 'compass';
}

/** The favourites store id of a content item (`${categorySlug}:${id}`, unchanged so existing saves survive). */
export function favoriteIdOf(category: Pick<Category, 'slug'>, item: Pick<Item, 'id'>): string {
  return `${category.slug}:${item.id}`;
}

export function toGuideEntry(item: Item, category: Category, locale: Locale, t: Dictionary): GuideEntry {
  const tags = item.tags ?? [];
  const slug = item.slug ?? item.id;
  const name = pickLocale(item, 'name', locale) ?? item.name;
  const address = pickLocale(item, 'address', locale);
  const photo = item.heroImage && !ART_TILE_PHOTOS.has(item.heroImage) ? item.heroImage : undefined;
  const tagLabel = tags.map((tag) => t.momentTags[tag]).find(Boolean);
  const categoryLabel = tagLabel
    ?? t.categories[category.slug as keyof Dictionary['categories']]
    ?? pickLocale(category, 'title', locale)
    ?? category.title;
  const distanceKm = item.location
    ? straightLineKm(APARTMENT_LOCATION, [item.location.lng, item.location.lat])
    : undefined;

  return {
    id: item.id,
    slug,
    categorySlug: category.slug,
    favoriteId: favoriteIdOf(category, item),
    href: `/${locale}/${category.slug}/${slug}`,
    name,
    summary: pickLocale(item, 'summary', locale),
    description: pickLocale(item, 'description', locale),
    descriptionTitle: pickLocale(item, 'descriptionTitle', locale),
    tags,
    categoryLabel,
    icon: iconFor(tags, category.slug),
    photo,
    photoPosition: photo ? item.heroImagePosition : undefined,
    address,
    phones: [...new Set([item.phone, ...(item.phones ?? [])].filter((value): value is string => Boolean(value)))],
    website: item.website,
    // Without coordinates, search the place name instead of the address: addresses can be descriptive
    // ("Near Charavgi, …", R-366). No address and no coordinates still means no Directions link.
    directionsUrl: item.directionsUrl
      ?? mapsHref(address ? `${name}, Messinia, Greece` : undefined, item.location?.lat, item.location?.lng),
    location: item.location,
    distanceKm,
    distanceText: distanceKm === undefined ? undefined : formatDistance(distanceKm, locale),
  };
}

/** Closest to the apartment first; places without coordinates keep their order at the end (§9.5). */
export function sortByDistance(entries: readonly GuideEntry[]): GuideEntry[] {
  return [...entries].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

/** The `count` other entries closest to `entry` ("More nearby"), or closest to the apartment without coordinates. */
export function nearestTo(entry: GuideEntry, entries: readonly GuideEntry[], count: number): GuideEntry[] {
  const others = entries.filter((candidate) => candidate.id !== entry.id);
  if (!entry.location) return sortByDistance(others).slice(0, count);
  const from: [number, number] = [entry.location.lng, entry.location.lat];
  const away = (candidate: GuideEntry) => (candidate.location
    ? straightLineKm(from, [candidate.location.lng, candidate.location.lat])
    : Infinity);
  return [...others].sort((a, b) => away(a) - away(b)).slice(0, count);
}
