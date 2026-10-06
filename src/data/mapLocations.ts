import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';
import { dedupeById } from '@/lib/collections';
import { pickLocale } from '@/lib/localize';
import { getApartmentContent } from '@/data/apartmentData';
import { HOST_CONTACT } from '@/data/contact';

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
  | 'city-center'
  | 'church';

type MapCoordinates = [lng: number, lat: number];

export interface MapLocation {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  phones?: string[];
  website?: string;
  directionsUrl?: string;
  coordinates: MapCoordinates;
  markerType: MapMarkerType;
  href?: string;
  /** The place's number in the guide's map list (identity §8 MapCard); set only when numbering is asked for. */
  number?: number;
  /** A pre-formatted popup meta line, e.g. "Museum · 1.5 km" (identity §8 MapCard popup). */
  meta?: string;
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
  tags?: string[];
  location?: { lat: number; lng: number };
  slug?: string;
}

export interface MapContentItem {
  item: CategoryMapItem;
  categorySlug: string;
  meta?: string;
}

interface LocalizedMapText {
  en: string;
  el: string;
}

interface KalamataLandmarkDefinition {
  id: string;
  name: LocalizedMapText;
  description: LocalizedMapText;
  address: LocalizedMapText;
  coordinates: MapCoordinates;
  markerType: MapMarkerType;
  sourceUrls: string[];
}

/**
 * Curated, stable points that should appear wherever the local map is shown.
 * Coordinates use the application-wide `[lng, lat]` format.
 */
const KALAMATA_LANDMARKS: readonly KalamataLandmarkDefinition[] = [
  {
    id: 'landmark-almyros-beach',
    name: { en: 'Almyros Beach', el: 'Παραλία Αλμυρού' },
    description: {
      en: 'A popular pebble beach east of Kalamata, near Verga.',
      el: 'Δημοφιλής βοτσαλωτή παραλία ανατολικά της Καλαμάτας, κοντά στη Βέργα.',
    },
    address: { en: 'Almyros, Verga, Kalamata', el: 'Αλμυρός, Βέργα, Καλαμάτα' },
    coordinates: [22.155378, 36.99795],
    markerType: 'beach',
    sourceUrls: [
      'https://visit-kalamata.gr/en/almyrosen/',
      'https://sandee.com/map/almiros-beach/@36.99795,22.155378',
    ],
  },
  {
    id: 'landmark-kordia-beach',
    name: { en: 'West Kalamata – Kordia Beach', el: 'Δυτική Παραλία Καλαμάτας – Κορδίας' },
    description: {
      en: 'An organised beach west of the port, with views across the Messinian Gulf.',
      el: 'Οργανωμένη παραλία δυτικά του λιμανιού, με θέα στον Μεσσηνιακό Κόλπο.',
    },
    address: { en: 'Kordia Beach, Kalamata', el: 'Παραλία Κορδίας, Καλαμάτα' },
    coordinates: [22.0894, 37.027],
    markerType: 'beach',
    sourceUrls: [
      'https://www.blueflag.gr/el/beach/dytiki-kalamata-paralia-kordia',
      'https://visitpeloponnese.com/en/toyristiko-periehomeno/beaches-kalamata',
    ],
  },
  {
    id: 'landmark-vasileos-georgiou-square',
    name: { en: 'Vasileos Georgiou Square', el: 'Πλατεία Βασιλέως Γεωργίου' },
    description: {
      en: 'Kalamata’s central square and a focal point for daily city life.',
      el: 'Η κεντρική πλατεία της Καλαμάτας και σημείο συνάντησης της πόλης.',
    },
    address: { en: 'Vasileos Georgiou Square, Kalamata', el: 'Πλατεία Βασιλέως Γεωργίου, Καλαμάτα' },
    coordinates: [22.1110293, 37.0381278],
    markerType: 'city-center',
    sourceUrls: [
      'https://kalamata.gr/el/component/gmapfp/308:plateia-georgiou?view=gmapfp',
      'https://www.openstreetmap.org/way/298356181',
    ],
  },
  {
    id: 'landmark-march-23-square',
    name: { en: '23rd of March Square', el: 'Πλατεία 23ης Μαρτίου' },
    description: {
      en: 'The historic square at the heart of Kalamata’s old town.',
      el: 'Η ιστορική πλατεία στην καρδιά της παλιάς πόλης της Καλαμάτας.',
    },
    address: { en: '23rd of March Square, Kalamata', el: 'Πλατεία 23ης Μαρτίου, Καλαμάτα' },
    coordinates: [22.1131936, 37.0429578],
    markerType: 'sightseeing',
    sourceUrls: [
      'https://greece.terrabook.com/el/messinia/page/plateia-23-martiou/',
      'https://www.openstreetmap.org/way/552176073',
    ],
  },
  {
    id: 'landmark-agia-triada-church',
    name: { en: 'Holy Trinity Church', el: 'Ιερός Ναός Αγίας Τριάδας' },
    description: {
      en: 'The parish church of Agia Triada on Athinon Avenue.',
      el: 'Ο ενοριακός ναός της Αγίας Τριάδας στη λεωφόρο Αθηνών.',
    },
    address: { en: '150 Athinon Avenue, Kalamata', el: 'Αθηνών 150, Καλαμάτα' },
    coordinates: [22.0958081, 37.0416033],
    markerType: 'church',
    sourceUrls: [
      'https://kalamata.gr/el/component/gmapfp/420:2014-01-13-09-09-51?view=gmapfp',
    ],
  },
  {
    id: 'landmark-sklavenitis-athinon',
    name: { en: 'Sklavenitis Supermarket', el: 'ΣΚΛΑΒΕΝΙΤΗΣ' },
    description: {
      en: 'Sklavenitis supermarket on Athinon Avenue.',
      el: 'Σούπερ μάρκετ ΣΚΛΑΒΕΝΙΤΗΣ στη λεωφόρο Αθηνών.',
    },
    address: { en: 'Athinon Avenue, Kalamata', el: 'Λεωφόρος Αθηνών, Καλαμάτα' },
    coordinates: [22.0911789, 37.0433823],
    markerType: 'shop',
    sourceUrls: [
      'https://www.sklavenitis.gr/about/katastimata/',
      'https://www.openstreetmap.org/node/6636741387',
    ],
  },
];

function localizedText(text: LocalizedMapText, locale: Locale): string {
  return text[locale] || text.en;
}

function getDirectionsUrl(coordinates: MapCoordinates): string {
  const [lng, lat] = coordinates;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function getKalamataLandmarks(locale: Locale): MapLocation[] {
  return KALAMATA_LANDMARKS.map((landmark) => ({
    id: landmark.id,
    name: localizedText(landmark.name, locale),
    description: localizedText(landmark.description, locale),
    address: localizedText(landmark.address, locale),
    directionsUrl: getDirectionsUrl(landmark.coordinates),
    coordinates: landmark.coordinates,
    markerType: landmark.markerType,
  }));
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
  if (tags.has('church') || tags.has('religion')) return 'church';
  if (tags.has('museum') || tags.has('culture') || tags.has('history')) return 'attraction';

  return 'attraction';
}

export function getApartmentMapLocation(
  locale: Locale,
): MapLocation & { address: string; phone: string; directionsUrl: string } {
  const apartment = getApartmentContent(locale);
  const address = locale === 'el'
    ? 'Αρχιμήδους 21, Καλαμάτα 24100, Ελλάδα'
    : 'Archimidous 21, Kalamata 24100, Greece';

  return {
    id: 'apartment',
    name: apartment.shortName,
    description: apartment.description,
    address,
    phone: HOST_CONTACT.phone,
    directionsUrl: 'https://maps.app.goo.gl/wW1Lnh14k3psKGAm9',
    coordinates: APARTMENT_LOCATION,
    markerType: 'apartment',
  };
}

function createMapLocationFromItem(
  { item, categorySlug, meta }: MapContentItem,
  locale: Locale | string
): MapLocation | null {
  if (!item.location || typeof item.location.lat !== 'number' || typeof item.location.lng !== 'number') {
    return null;
  }

  const eff: Locale = normalizeLocale(locale);
  const name = pickLocale(item, 'name', eff) ?? item.name;
  const description = pickLocale(item, 'summary', eff) ?? pickLocale(item, 'description', eff);
  const address = pickLocale(item, 'address', eff);
  const phones = item.phones?.length ? item.phones : item.phone ? [item.phone] : undefined;

  return {
    id: item.id,
    name,
    description,
    address,
    phone: item.phone ?? phones?.[0],
    phones,
    website: item.website,
    directionsUrl: item.directionsUrl ?? getDirectionsUrl([item.location.lng, item.location.lat]),
    coordinates: [item.location.lng, item.location.lat],
    markerType: markerTypeForItem(item, categorySlug),
    href: `/${eff}/${categorySlug}/${item.slug || item.id}`,
    meta,
  };
}

/**
 * The apartment, the curated landmarks and the content items that have coordinates. With `numbered`,
 * the content items are numbered 1…n in the given order, so the map pins match the guide's list.
 */
export function getKalamataMapLocations(
  locale: Locale,
  contentItems: readonly MapContentItem[] = [],
  { numbered = false }: { numbered?: boolean } = {},
): MapLocation[] {
  const locations: MapLocation[] = [getApartmentMapLocation(locale)];

  locations.push(...getKalamataLandmarks(locale));

  let count = 0;
  contentItems.forEach((contentItem) => {
    const location = createMapLocationFromItem(contentItem, locale);
    if (!location) return;
    count += 1;
    locations.push(numbered ? { ...location, number: count } : location);
  });

  return dedupeById(locations);
}
