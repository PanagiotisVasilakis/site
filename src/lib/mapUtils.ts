// Map utilities - lightweight, no heavy mapping library imports.

import {
  APARTMENT_LOCATION,
  createMapLocationFromItem,
  type CategoryMapItem,
  type MapLocation,
  type MapMarkerType,
} from '@/data/mapLocations';

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

export function createMarkerFromItem(
  item: CategoryMapItem,
  categorySlug: string,
  locale: string
): MarkerData | null {
  const location = createMapLocationFromItem(item, categorySlug, locale);
  return location ? markerFromMapLocation(location) : null;
}
