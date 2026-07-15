import { describe, expect, it, vi } from 'vitest';

import { buildBasePopupHtml, escapeMapHtml } from '@/components/maps/leafletPopup';
import { buildMenuLinks } from '@/components/navigation/menuLinks';
import { getApartmentContent } from '@/data/apartmentData';
import {
  getApartmentMapLocation,
  getKalamataLandmarks,
} from '@/data/mapLocations';
import { getDictionary } from '@/i18n/dictionaries';
import {
  getCategoriesWithCounts,
  getItem,
  getItemsByCategory,
  isRecentlyUpdated,
  pickLocale,
  toSlug,
} from '@/lib/data';
import {
  dedupeMarkers,
  getKalamataMarkers,
  markerFromMapLocation,
  toLeafletMarker,
} from '@/lib/mapUtils';

describe('validated content access', () => {
  it('loads only known category data and rejects traversal-shaped identifiers', () => {
    expect(getItemsByCategory('moments').length).toBeGreaterThan(0);
    expect(getItemsByCategory('phones').length).toBeGreaterThan(0);
    expect(getItemsByCategory('../secrets')).toEqual([]);
    expect(getItemsByCategory('moments/../../secrets')).toEqual([]);
    expect(getItemsByCategory('A'.repeat(51))).toEqual([]);
    expect(getItemsByCategory('missing-category')).toEqual([]);
  });

  it('finds known content and rejects unsafe slugs', () => {
    const first = getItemsByCategory('moments')[0];
    expect(first).toBeDefined();
    expect(getItem('moments', first.slug ?? toSlug(first.name))?.id).toBe(first.id);
    expect(getItem('../moments', 'anything')).toBeNull();
    expect(getItem('moments', '../anything')).toBeNull();
    expect(getItem('moments', 'missing')).toBeNull();
  });

  it('orders categories and reports counts from validated files', () => {
    const categories = getCategoriesWithCounts();
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories.map(({ order }) => order ?? 999)).toEqual(
      [...categories].map(({ order }) => order ?? 999).sort((a, b) => a - b),
    );
    expect(categories.find(({ id }) => id === 'moments')?.count).toBeGreaterThan(0);
  });

  it('normalizes slugs and applies locale fallback order', () => {
    expect(toSlug('  Kalamata & Sea! ')).toBe('kalamata-sea');
    expect(pickLocale({ title: 'Base', title_en: 'English', title_el: 'Ελληνικά' }, 'title', 'el')).toBe('Ελληνικά');
    expect(pickLocale({ title: 'Base', title_en: 'English' }, 'title', 'el')).toBe('Base');
    expect(pickLocale({ title_en: 'English' }, 'title', 'el')).toBe('English');
    expect(pickLocale({}, 'title', 'el')).toBeUndefined();
  });

  it('evaluates recent updates against a controlled clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-31T00:00:00Z'));
    expect(isRecentlyUpdated({ updatedAt: '2030-01-15T00:00:00Z' } as never, 30)).toBe(true);
    expect(isRecentlyUpdated({ updatedAt: '2029-01-01T00:00:00Z' } as never, 30)).toBe(false);
    expect(isRecentlyUpdated({ updatedAt: 'invalid' } as never)).toBe(false);
    expect(isRecentlyUpdated({} as never)).toBe(false);
    vi.useRealTimers();
  });

  it('provides complete localized apartment content', () => {
    expect(getApartmentContent('en').shortName).toBeTruthy();
    expect(getApartmentContent('el').description).toMatch(/[Α-Ωα-ω]/);
  });
});

describe('shared map catalog', () => {
  it('keeps every curated landmark within the Kalamata coordinate region', () => {
    const landmarks = getKalamataLandmarks('en');
    expect(landmarks.map(({ id }) => id)).toEqual([
      'landmark-almyros-beach',
      'landmark-kordia-beach',
      'landmark-vasileos-georgiou-square',
      'landmark-march-23-square',
      'landmark-agia-triada-church',
      'landmark-sklavenitis-athinon',
    ]);
    landmarks.forEach(({ coordinates: [longitude, latitude] }) => {
      expect(longitude).toBeGreaterThan(22);
      expect(latitude).toBeGreaterThan(36);
    });
    expect(getKalamataLandmarks('el')[0].name).toMatch(/[Α-Ωα-ω]/);
  });

  it('uses the canonical apartment address and directions URL', () => {
    expect(getApartmentMapLocation('en')).toMatchObject({
      id: 'apartment',
      address: 'Archimidous 21, Kalamata 24100, Greece',
      directionsUrl: 'https://maps.app.goo.gl/wW1Lnh14k3psKGAm9',
      markerType: 'apartment',
    });
    expect(getApartmentMapLocation('el').address).toContain('Αρχιμήδους 21');
  });

  it('combines content markers, omits missing coordinates and deduplicates ids', () => {
    const markers = getKalamataMarkers('en', [
      {
        categorySlug: 'moments',
        item: {
          id: 'local-museum',
          name: 'Local Museum',
          summary: 'Local history',
          location: { lat: 37.1, lng: 22.1 },
          tags: ['museum'],
          slug: 'local-museum',
        },
      },
      { categorySlug: 'phones', item: { id: 'no-pin', name: 'Phone service' } },
      {
        categorySlug: 'moments',
        item: {
          id: 'landmark-almyros-beach',
          name: 'Duplicate landmark',
          location: { lat: 37.1, lng: 22.1 },
        },
      },
    ]);
    expect(markers).toHaveLength(8);
    expect(markers.filter(({ id }) => id === 'landmark-almyros-beach')).toHaveLength(1);
    expect(markers).toContainEqual(expect.objectContaining({
      id: 'local-museum',
      description: 'Local history',
      coordinates: [22.1, 37.1],
      type: 'attraction',
      href: '/en/moments/local-museum',
    }));
  });

  it('converts between shared and Leaflet marker representations without PII expansion', () => {
    const location = getApartmentMapLocation('en');
    const marker = markerFromMapLocation(location);
    expect(toLeafletMarker(marker)).toEqual(expect.objectContaining({
      id: 'apartment',
      coordinates: location.coordinates,
      type: 'apartment',
    }));
    expect(dedupeMarkers([marker, { ...marker, name: 'duplicate' }])).toEqual([marker]);
  });
});

describe('navigation and popup presentation', () => {
  it('builds canonical localized public destinations', () => {
    const links = buildMenuLinks('el', getDictionary('el'), false);
    expect(links.map(({ href }) => href)).toEqual([
      '/el/apartment',
      '/el/book',
      '/el/booking-details',
      '/el/about',
      '/el/favorites',
      '/el/moments',
      '/el/phones',
    ]);
    expect(links.find(({ href }) => href === '/el/book')?.featured).toBe(true);
  });

  it('adds check-in only for verified guests', () => {
    expect(buildMenuLinks('en', getDictionary('en'), false).some(({ href }) => href.endsWith('/check-in'))).toBe(false);
    expect(buildMenuLinks('en', getDictionary('en'), true)).toContainEqual(expect.objectContaining({
      href: '/en/check-in',
      icon: 'checkin',
      event: 'mobile_nav_checkin',
    }));
  });

  it('escapes all untrusted popup content and URLs', () => {
    const labels = {
      address: 'Address', phone: 'Phone', directions: 'Directions', website: 'Website', details: 'Details',
      locateMe: 'Locate', locationUnavailable: 'Unavailable', fitToMarkers: 'Fit', zoomIn: 'In', zoomOut: 'Out',
      apartment: 'Apartment', approximate: 'Approximate', travelUnavailable: 'Unavailable',
      travelUnavailableWithDirections: 'Unavailable', clearRoute: 'Clear', route: 'Route', driving: 'Driving',
      walking: 'Walking', cycling: 'Cycling', unavailable: 'Unavailable',
    };
    const html = buildBasePopupHtml({
      id: 'marker',
      name: '<script>alert(1)</script>',
      description: 'Safe & useful',
      website: 'https://example.com/?q="quoted"',
      coordinates: [22.1, 37.04],
    }, labels);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(escapeMapHtml(`<a href="'">&`)).toBe('&lt;a href=&quot;&#39;&quot;&gt;&amp;');
  });
});
