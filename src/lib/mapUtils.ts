// Map utilities - lightweight, no heavy dependencies
// This file contains types and functions used by mapping components
// but doesn't import any heavy mapping libraries

// Apartment location (Kalamata, Greece - real coordinates)
export const APARTMENT_LOCATION: [number, number] = [22.094364, 37.040635]; // Kalamata, Messenia

export interface MarkerData {
  id: string;
  name: string;
  description?: string;
  coordinates: [number, number]; // [lng, lat]
  type: 'apartment' | 'restaurant' | 'service' | 'attraction' | 'sightseeing' | 'beach' | 'shop' | 'cafe' | 'bar' | 'park' | 'police' | 'city-center';
  price?: string;
  rating?: number;
  category?: string;
  href?: string;
}

interface GenericCategoryItem {
  id: string;
  name: string;
  summary?: string;
  rating?: number;
  priceLevel?: number;
  location?: { lat: number; lng: number };
  slug?: string;
}

export function createMarkerFromItem(item: GenericCategoryItem, categorySlug: string, locale: string): MarkerData {
  // Extract coordinates from item or use default location near villa
  const coords: [number, number] = item.location ?
    [item.location.lng, item.location.lat] :
    [
      APARTMENT_LOCATION[0] + (Math.random() - 0.5) * 0.02, // Small random offset
      APARTMENT_LOCATION[1] + (Math.random() - 0.5) * 0.02
    ];

  let type: MarkerData['type'] = 'attraction';
  if (categorySlug === 'moments') {
    type = 'restaurant';
  } else if (categorySlug === 'phones') {
    if (item.name.toLowerCase().includes('police')) {
      type = 'police';
    } else {
      type = 'service';
    }
  } else if (categorySlug === 'sightseeing') {
    if (item.name.toLowerCase().includes('city center')) {
      type = 'city-center';
    } else {
      type = 'sightseeing';
    }
  }

  return {
    id: item.id,
    name: item.name,
    description: item.summary,
    coordinates: coords,
    type,
    rating: item.rating,
    price: item.priceLevel ? '€'.repeat(item.priceLevel) : undefined,
    category: categorySlug,
    href: `/${locale}/${categorySlug}/${item.slug || item.id}`
  };
}