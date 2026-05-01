import { createMarkerFromItem } from './mapUtils';

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
});
