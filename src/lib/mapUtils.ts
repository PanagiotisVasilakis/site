// Map utilities - lightweight, no heavy mapping library imports.

import {
  APARTMENT_LOCATION,
  createMapLocationFromItem,
  getKalamataMapLocations,
  type CategoryMapItem,
  type MapContentItem,
  type MapLocation,
  type MapMarkerType,
} from '@/data/mapLocations';
import type { Locale } from '@/i18n/config';
import type { LeafletMarkerData } from '@/components/LeafletMap';
import { dedupeById } from '@/lib/collections';

export { APARTMENT_LOCATION };

export interface MarkerData {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  phones?: string[];
  website?: string;
  directionsUrl?: string;
  coordinates: [number, number]; // [lng, lat]
  type: MapMarkerType;
  price?: string;
  rating?: number;
  category?: string;
  href?: string;
  sourceUrls?: string[];
}

export function markerFromMapLocation(location: MapLocation): MarkerData {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    address: location.address,
    phone: location.phone,
    phones: location.phones,
    website: location.website,
    directionsUrl: location.directionsUrl,
    coordinates: location.coordinates,
    type: location.markerType,
    price: location.price,
    rating: location.rating,
    category: location.category,
    href: location.href,
    sourceUrls: location.sourceUrls,
  };
}

function markersFromMapLocations(locations: readonly MapLocation[]): MarkerData[] {
  return locations.map(markerFromMapLocation);
}

export function createMarkerFromItem(
  item: CategoryMapItem,
  categorySlug: string,
  locale: string
): MarkerData | null {
  const location = createMapLocationFromItem(item, categorySlug, locale);
  return location ? markerFromMapLocation(location) : null;
}

export function getKalamataMarkers(
  locale: Locale,
  contentItems: readonly MapContentItem[] = [],
  options?: { includeApartment?: boolean; includeLandmarks?: boolean }
): MarkerData[] {
  return markersFromMapLocations(getKalamataMapLocations(locale, contentItems, options));
}

export function dedupeMarkers(markers: readonly MarkerData[]): MarkerData[] {
  return dedupeById(markers);
}

export function toLeafletMarker(marker: MarkerData): LeafletMarkerData {
  return {
    id: marker.id,
    name: marker.name,
    description: marker.description,
    address: marker.address,
    phone: marker.phone,
    phones: marker.phones,
    website: marker.website,
    directionsUrl: marker.directionsUrl,
    coordinates: marker.coordinates,
    type: marker.type,
    price: marker.price,
    href: marker.href,
  };
}
