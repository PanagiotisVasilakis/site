// The relief map's pins (identity §8 LocationRelief): positions come from the coordinates of the guide's
// map data (src/data/mapLocations.ts and the moments items), projected into the illustrated plan. The
// plan is "illustrative, not to scale": the box below only has to hold the pins and put the beach on
// the drawn coast.

import { APARTMENT_LOCATION, getKalamataLandmarks } from '@/data/mapLocations';
import type { Locale } from '@/i18n/config';
import type { HomeDistanceKey } from '@/i18n/domains/home';
import { getItemsByCategory } from '@/lib/data';

type LngLat = readonly [lng: number, lat: number];

/** West, east, north and south edges of the plan (degrees). */
const BOX = { west: 22.075, east: 22.13, north: 37.05, south: 37.0205 } as const;

/** A point as percentages of the plan (left, top), clamped to its edges. */
export function reliefPoint([lng, lat]: LngLat): { left: number; top: number } {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return {
    left: clamp(((lng - BOX.west) / (BOX.east - BOX.west)) * 100),
    top: clamp(((BOX.north - lat) / (BOX.north - BOX.south)) * 100),
  };
}

/** Where each DistanceList row's place is in the guide data (rows without coordinates get no pin). */
const PIN_SOURCES: Partial<Record<HomeDistanceKey, { landmark: string } | { moment: string }>> = {
  beach: { landmark: 'landmark-kordia-beach' },
  centre: { landmark: 'landmark-vasileos-georgiou-square' },
  museum: { moment: 'archaeological-museum-messinia' },
};

export type ReliefPin = Readonly<{ key: HomeDistanceKey; left: number; top: number }>;

function coordinatesOf(source: { landmark: string } | { moment: string }, locale: Locale): LngLat | null {
  if ('landmark' in source) {
    return getKalamataLandmarks(locale).find((landmark) => landmark.id === source.landmark)?.coordinates ?? null;
  }
  const location = getItemsByCategory('moments').find((item) => item.id === source.moment)?.location;
  return location ? [location.lng, location.lat] : null;
}

/** The pins of the given rows that have coordinates, in the rows' order. */
export function reliefPins(keys: readonly HomeDistanceKey[], locale: Locale): ReliefPin[] {
  return keys.flatMap((key) => {
    const source = PIN_SOURCES[key];
    const coordinates = source ? coordinatesOf(source, locale) : null;
    return coordinates ? [{ key, ...reliefPoint(coordinates) }] : [];
  });
}

export const HOME_POINT = reliefPoint(APARTMENT_LOCATION);
