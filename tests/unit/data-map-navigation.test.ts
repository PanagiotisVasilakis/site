import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { buildBasePopupHtml, escapeMapHtml } from '@/components/maps/leafletPopup';
import { getApartmentContent } from '@/data/apartmentData';
import {
  getApartmentMapLocation,
  getKalamataLandmarks,
  getKalamataMapLocations,
} from '@/data/mapLocations';
import { ItemSchema } from '@/data/schemas';
import {
  getOrderedCategories,
  getItem,
  getItemsByCategory,
  pickLocale,
  toSlug,
} from '@/lib/data';
import { logger } from '@/lib/logger-enterprise';

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

  it('orders categories and loads items from validated files', () => {
    const categories = getOrderedCategories();
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories.map(({ order }) => order ?? 999)).toEqual(
      [...categories].map(({ order }) => order ?? 999).sort((a, b) => a - b),
    );
    expect(getItemsByCategory('moments').length).toBeGreaterThan(0);
  });

  it('normalizes slugs and applies locale fallback order', () => {
    expect(toSlug('  Kalamata & Sea! ')).toBe('kalamata-sea');
    expect(pickLocale({ title: 'Base', title_en: 'English', title_el: 'Ελληνικά' }, 'title', 'el')).toBe('Ελληνικά');
    expect(pickLocale({ title: 'Base', title_en: 'English' }, 'title', 'el')).toBe('Base');
    expect(pickLocale({ title_en: 'English' }, 'title', 'el')).toBe('English');
    expect(pickLocale({}, 'title', 'el')).toBeUndefined();
  });

  it('treats a whitespace-only localized name as missing on both the card and the map', () => {
    const item = {
      id: 'whitespace-name',
      name: 'Base name',
      name_el: '   ',
      name_en: 'English name',
      location: { lat: 37.04, lng: 22.11 },
    };
    const cardName = pickLocale(item, 'name', 'el') ?? item.name;
    const mapName = getKalamataMapLocations('el', [{ item, categorySlug: 'moments' }])
      .find(({ id }) => id === item.id)?.name;
    expect(cardName).toBe('Base name');
    expect(mapName).toBe(cardName);
    expect(pickLocale({ title: ' ', title_en: 'English' }, 'title', 'el')).toBe('English');
    expect(pickLocale({ title: '\t\n' }, 'title', 'el')).toBeUndefined();
  });

  it('does not carry star ratings or update timestamps on content items', () => {
    const parsed = ItemSchema.parse({
      id: 'x', categoryId: 'moments', name: 'X', rating: 4.5, updatedAt: '2030-01-15T00:00:00Z',
    });
    expect(parsed).not.toHaveProperty('rating');
    expect(parsed).not.toHaveProperty('updatedAt');
  });

  it('reports unreadable category files through the structured logger', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const read = vi.spyOn(fs, 'readFileSync').mockReturnValue('{"not":"an array"}');

    expect(getItemsByCategory('moments')).toEqual([]);
    expect(warn).toHaveBeenLastCalledWith(
      'Category data file does not contain an array',
      { categoryId: 'moments', receivedType: 'object' },
    );

    read.mockReturnValue('[{');
    expect(getItemsByCategory('phones')).toEqual([]);
    expect(warn).toHaveBeenLastCalledWith(
      'Category data file is not valid JSON',
      { categoryId: 'phones', errorName: 'SyntaxError' },
    );
    expect(consoleWarn).not.toHaveBeenCalled();
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
    const markers = getKalamataMapLocations('en', [
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
      markerType: 'attraction',
      href: '/en/moments/local-museum',
    }));
    expect(markers.every((marker) => marker.number === undefined)).toBe(true);
  });

  it('numbers the content pins 1…n in list order only when asked (identity §8 MapCard)', () => {
    const item = (id: string, lat?: number) => ({
      categorySlug: 'moments',
      meta: `Museum · ${id}`,
      item: { id, name: id, location: lat === undefined ? undefined : { lat, lng: 22.1 } },
    });
    const markers = getKalamataMapLocations('en', [item('a', 37.01), item('no-pin'), item('b', 37.02)], { numbered: true });

    expect(markers.filter((marker) => marker.number !== undefined).map(({ id, number, meta }) => ({ id, number, meta }))).toEqual([
      { id: 'a', number: 1, meta: 'Museum · a' },
      { id: 'b', number: 2, meta: 'Museum · b' },
    ]);
    expect(markers.find((marker) => marker.id === 'apartment')?.number).toBeUndefined();
  });
});

describe('navigation and popup presentation', () => {
  it('escapes all untrusted popup content and URLs', () => {
    const labels = {
      address: 'Address', phone: 'Phone', directions: 'Directions', website: 'Website', details: 'Details',
      home: 'Home', locateMe: 'Locate', locationUnavailable: 'Unavailable', fitToMarkers: 'Fit', zoomIn: 'In', zoomOut: 'Out',
    };
    const html = buildBasePopupHtml({
      id: 'marker',
      name: '<script>alert(1)</script>',
      description: 'Safe & useful',
      website: 'https://example.com/?q="quoted"',
      coordinates: [22.1, 37.04],
      markerType: 'attraction',
      meta: '<b>Museum</b> · 1.5 km',
      phones: ['+30 27210 26464'],
    }, labels);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).toContain('&lt;b&gt;Museum&lt;/b&gt; · 1.5 km');
    expect(html).toContain('href="tel:+302721026464"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(escapeMapHtml(`<a href="'">&`)).toBe('&lt;a href=&quot;&#39;&quot;&gt;&amp;');
  });
});
