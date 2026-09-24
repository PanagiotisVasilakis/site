import type { Locale } from '@/i18n/config';
import { dedupeById } from '@/lib/collections';
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
  category: string;
  markerType: MapMarkerType;
  href?: string;
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
  tags?: string[];
  location?: { lat: number; lng: number };
  slug?: string;
}

export interface MapContentItem {
  item: CategoryMapItem;
  categorySlug: string;
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
  category: 'landmarks';
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
    category: 'landmarks',
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
    category: 'landmarks',
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
    category: 'landmarks',
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
    category: 'landmarks',
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
    category: 'landmarks',
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
    category: 'landmarks',
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

export function getKalamataLandmarks(locale: Locale = 'en'): MapLocation[] {
  return KALAMATA_LANDMARKS.map((landmark) => ({
    id: landmark.id,
    name: localizedText(landmark.name, locale),
    description: localizedText(landmark.description, locale),
    address: localizedText(landmark.address, locale),
    directionsUrl: getDirectionsUrl(landmark.coordinates),
    coordinates: landmark.coordinates,
    category: landmark.category,
    markerType: landmark.markerType,
    sourceUrls: [...landmark.sourceUrls],
  }));
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
  if (tags.has('church') || tags.has('religion')) return 'church';
  if (tags.has('museum') || tags.has('culture') || tags.has('history')) return 'attraction';

  return 'attraction';
}

export function getApartmentMapLocation(
  locale: Locale = 'en',
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
    phone: '+30 695 581 0051',
    directionsUrl: 'https://maps.app.goo.gl/wW1Lnh14k3psKGAm9',
    coordinates: APARTMENT_LOCATION,
    category: 'apartment',
    markerType: 'apartment',
  };
}

function createMapLocationFromItem(
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
    directionsUrl: item.directionsUrl ?? getDirectionsUrl([item.location.lng, item.location.lat]),
    coordinates: [item.location.lng, item.location.lat],
    category: categorySlug,
    markerType: markerTypeForItem(item, categorySlug),
    rating: item.rating,
    href: `/${eff}/${categorySlug}/${item.slug || item.id}`,
    sourceUrls: item.sourceUrls,
  };
}

function dedupeMapLocations(locations: MapLocation[]): MapLocation[] {
  return dedupeById(locations);
}

export function getKalamataMapLocations(
  locale: Locale,
  contentItems: readonly MapContentItem[] = [],
  options: { includeApartment?: boolean; includeLandmarks?: boolean } = {}
): MapLocation[] {
  const { includeApartment = true, includeLandmarks = true } = options;
  const locations: MapLocation[] = [];

  if (includeApartment) locations.push(getApartmentMapLocation(locale));
  if (includeLandmarks) locations.push(...getKalamataLandmarks(locale));

  contentItems.forEach(({ item, categorySlug }) => {
    const location = createMapLocationFromItem(item, categorySlug, locale);
    if (location) locations.push(location);
  });

  return dedupeMapLocations(locations);
}
