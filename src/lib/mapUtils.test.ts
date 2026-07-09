import { createMarkerFromItem, getKalamataMarkers } from './mapUtils';
import { getKalamataLandmarks } from '@/data/mapLocations';
import { getItemsByCategory } from '@/lib/data';

describe('mapUtils', () => {
  it('creates a marker when coordinates are present', () => {
    const marker = createMarkerFromItem(
      {
        id: 'museum',
        name: 'Museum',
        summary: 'Local museum',
        address: 'Main St',
        phone: '+30 123',
        location: { lat: 37.1, lng: 22.1 },
        tags: ['museum'],
        slug: 'museum',
      },
      'moments',
      'en'
    );

    expect(marker).toMatchObject({
      id: 'museum',
      name: 'Museum',
      description: 'Local museum',
      address: 'Main St',
      phone: '+30 123',
      coordinates: [22.1, 37.1],
      type: 'attraction',
      href: '/en/moments/museum',
    });
  });

  it('does not create random fallback pins for items without coordinates', () => {
    expect(createMarkerFromItem({ id: 'phone', name: 'Taxi' }, 'phones', 'en')).toBeNull();
  });

  it('provides every curated Kalamata landmark in the shared map catalog', () => {
    const landmarkIds = getKalamataLandmarks('en').map((location) => location.id);

    expect(landmarkIds).toEqual([
      'landmark-almyros-beach',
      'landmark-kordia-beach',
      'landmark-vasileos-georgiou-square',
      'landmark-march-23-square',
      'landmark-agia-triada-church',
      'landmark-sklavenitis-athinon',
    ]);

    getKalamataLandmarks('en').forEach(({ coordinates: [lng, lat] }) => {
      expect(lng).toBeGreaterThan(22);
      expect(lat).toBeGreaterThan(36);
    });
    expect(getKalamataLandmarks('el').find((location) => location.id === 'landmark-almyros-beach')?.name)
      .toBe('Παραλία Αλμυρού');
  });

  it('combines the apartment, curated landmarks and every mappable content item without duplicates', () => {
    const markers = getKalamataMarkers('en', [
      {
        categorySlug: 'moments',
        item: {
          id: 'local-museum',
          name: 'Local Museum',
          location: { lat: 37.1, lng: 22.1 },
          tags: ['museum'],
          slug: 'local-museum',
        },
      },
      {
        categorySlug: 'phones',
        item: { id: 'no-pin', name: 'Phone service' },
      },
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
    expect(markers.filter((marker) => marker.id === 'landmark-almyros-beach')).toHaveLength(1);
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'local-museum',
        coordinates: [22.1, 37.1],
        directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=37.1,22.1',
      }),
    ]));
    expect(markers.find((marker) => marker.id === 'apartment')?.price).toBeUndefined();
  });

  it('maps only phone services with verified physical locations', () => {
    const phoneItems = getItemsByCategory('phones');
    const markers = getKalamataMarkers(
      'en',
      phoneItems.map((item) => ({ item, categorySlug: 'phones' }))
    );
    const phoneMarkerIds = markers
      .filter((marker) => phoneItems.some((item) => item.id === marker.id))
      .map((marker) => marker.id);

    expect(phoneMarkerIds).toEqual(expect.arrayContaining([
      'police',
      'fire-department',
      'kalamata-hospital',
    ]));
    expect(phoneMarkerIds).not.toEqual(expect.arrayContaining(['emergency-112', 'taxi']));
  });
});
