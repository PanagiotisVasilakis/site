import React from 'react';
import { render } from '@testing-library/react';
import ApartmentLocationMap from './ApartmentLocationMap';

type InteractiveMapMockProps = {
  locale: string;
  clusterMin: number;
  markers: Array<{ id: string; name: string }>;
};

const interactiveMapMock = vi.fn((props: InteractiveMapMockProps) => {
  void props;
  return <div data-testid="interactive-map" />;
});

vi.mock('./InteractiveMap', () => ({
  default: (props: InteractiveMapMockProps) => interactiveMapMock(props),
}));

describe('ApartmentLocationMap', () => {
  beforeEach(() => {
    interactiveMapMock.mockClear();
  });

  it('uses the shared catalog for landmarks and every mappable content item', () => {
    render(
      <ApartmentLocationMap
        locale="el"
        contentItems={[
          {
            categorySlug: 'moments',
            item: {
              id: 'existing-moment',
              name: 'Υπάρχον σημείο',
              location: { lat: 37.04, lng: 22.1 },
              tags: ['museum'],
            },
          },
          {
            categorySlug: 'phones',
            item: { id: 'phone-without-location', name: 'Τηλέφωνο' },
          },
        ]}
      />
    );

    const [props] = interactiveMapMock.mock.calls[0]!;

    expect(props.locale).toBe('el');
    expect(props.clusterMin).toBe(20);
    expect(props.markers.map((marker) => marker.id)).toEqual(expect.arrayContaining([
      'apartment',
      'landmark-almyros-beach',
      'landmark-kordia-beach',
      'landmark-vasileos-georgiou-square',
      'landmark-march-23-square',
      'landmark-agia-triada-church',
      'landmark-sklavenitis-athinon',
      'existing-moment',
    ]));
    expect(props.markers.some((marker) => marker.id === 'phone-without-location')).toBe(false);
    expect(props.markers.find((marker) => marker.id === 'landmark-almyros-beach')?.name).toBe('Παραλία Αλμυρού');
  });
});
