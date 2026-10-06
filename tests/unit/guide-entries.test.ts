import { describe, expect, it } from 'vitest';

import { formatDistance, nearestTo, sortByDistance, straightLineKm, toGuideEntry } from '@/components/guide/guideEntries';
import { chipCounts, filterByCategory } from '@/components/guide/guideFilters';
import { categories } from '@/data/categories';
import { APARTMENT_LOCATION } from '@/data/mapLocations';
import { getDictionary } from '@/i18n/dictionaries';
import { getItemsByCategory } from '@/lib/data';

const phones = categories.find((category) => category.slug === 'phones')!;
const moments = categories.find((category) => category.slug === 'moments')!;

describe('guide entries (identity §8 GuideCard, §7.3)', () => {
  it('measures the straight-line distance in km and formats it per locale', () => {
    expect(straightLineKm(APARTMENT_LOCATION, APARTMENT_LOCATION)).toBe(0);
    expect(straightLineKm([22.0, 37.0], [22.0, 38.0])).toBeCloseTo(111.2, 1);
    expect(formatDistance(1.46, 'en')).toBe('1.5 km');
    expect(formatDistance(1.46, 'el')).toBe('1,5 χλμ.');
    expect(formatDistance(0.799, 'en')).toBe('800 m');
    expect(formatDistance(0.799, 'el')).toBe('800 μ.');
    expect(formatDistance(0.001, 'en')).toBe('10 m');
  });

  it('uses the art tile for the dark Viktoria Karelia photo and the SOS illustration, photos elsewhere', () => {
    const t = getDictionary('en');
    const byId = (category: typeof phones, id: string) => toGuideEntry(
      getItemsByCategory(category.id).find((item) => item.id === id)!, category, 'en', t,
    );

    expect(byId(moments, 'viktoria-karelia-museum')).toMatchObject({ photo: undefined, icon: 'museum', categoryLabel: 'Museum' });
    expect(byId(moments, 'railway-park-kalamata').photo).toBe('/moments/railway-museum-hero.jpg');
    expect(byId(phones, 'emergency-112')).toMatchObject({ photo: undefined, icon: 'phone', distanceText: undefined });
    expect(byId(phones, 'police')).toMatchObject({ distanceText: '800 m', favoriteId: 'phones:police', href: '/en/phones/kalamata-police-station' });
  });

  it('sorts places without coordinates last and finds the nearest others', () => {
    const t = getDictionary('en');
    const entries = getItemsByCategory(phones.id).map((item) => toGuideEntry(item, phones, 'en', t));
    const sorted = sortByDistance(entries);

    expect(sorted.map((entry) => entry.id)).toEqual([
      'police', 'fire-department', 'kalamata-hospital',
      'emergency-112', 'ambulance-166', 'fire-service-199', 'police-100', 'coast-guard-108', 'child-sos-1056', 'poison-centre', 'taxi',
    ]);
    // Without coordinates: the closest to the apartment.
    expect(nearestTo(sorted[3], entries, 2).map((entry) => entry.id)).toEqual(['police', 'fire-department']);
    // With coordinates: the closest to the place itself, never the place.
    expect(nearestTo(sorted[2], entries, 1).map((entry) => entry.id)).toEqual(['police']);
  });

  it('searches Directions by the localized place name in Messinia without coordinates, by coordinates otherwise (R-366)', () => {
    const polylimnio = getItemsByCategory(moments.id).find((item) => item.id === 'polylimnio-gorge')!;
    const directions = (item: typeof polylimnio, locale: 'en' | 'el') => toGuideEntry(item, moments, locale, getDictionary(locale)).directionsUrl;

    expect([polylimnio.location, polylimnio.directionsUrl]).toEqual([undefined, undefined]);
    expect(directions(polylimnio, 'en')).toBe('https://maps.google.com/?q=Polylimnio%2C%20Messenia%2C%20Messinia%2C%20Greece');
    expect(directions(polylimnio, 'el')).toBe(`https://maps.google.com/?q=${encodeURIComponent('Πολυλίμνιο Μεσσηνίας, Messinia, Greece')}`);
    expect(directions({ ...polylimnio, location: { lat: 37.1, lng: 21.9 } }, 'en')).toBe('https://maps.google.com/?q=37.1,21.9');
    // No address and no coordinates: no Directions link at all.
    expect(toGuideEntry(getItemsByCategory(phones.id).find((item) => item.id === 'emergency-112')!, phones, 'en', getDictionary('en')).directionsUrl).toBeUndefined();
  });
});

describe('guide filters (R-325/R-326 decision)', () => {
  it('counts only categories with content and filters by their tags', () => {
    const items = [{ tags: ['museum'] }, { tags: ['museum', 'history'] }, { tags: ['beach'] }];

    expect(chipCounts(items)).toEqual([
      { key: 'all', count: 3 },
      { key: 'beaches', count: 1 },
      { key: 'museums', count: 2 },
      { key: 'sites', count: 1 },
    ]);
    expect(filterByCategory(items, 'all')).toHaveLength(3);
    expect(filterByCategory(items, 'bars')).toEqual([]);
    expect(chipCounts([])).toEqual([]);
  });
});
