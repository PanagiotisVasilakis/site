import React from 'react';
import { render, waitFor } from '@testing-library/react';
import CheckInInfo from './CheckInInfo';

const { dynamicMapMock, internalFetchMock } = vi.hoisted(() => ({
  dynamicMapMock: vi.fn(),
  internalFetchMock: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => (props: unknown) => {
    dynamicMapMock(props);
    return null;
  },
}));

vi.mock('@/lib/internalFetchClient', () => ({
  default: internalFetchMock,
}));

describe('CheckInInfo map integration', () => {
  beforeEach(() => {
    dynamicMapMock.mockClear();
    internalFetchMock.mockResolvedValue({ ok: false });
  });

  it('passes moments and services into the shared map component for canonical filtering', async () => {
    render(
      <CheckInInfo
        locale="en"
        nearbyRestaurants={[
          {
            id: 'museum',
            name: 'Museum',
            location: { lat: 37.04, lng: 22.1 },
            tags: ['museum'],
          },
        ]}
        nearbyServices={[
          {
            id: 'police',
            name: 'Police',
            location: { lat: 37.03, lng: 22.09 },
            tags: ['police'],
          },
          {
            id: 'emergency-112',
            name: 'Emergency 112',
            tags: ['emergency'],
          },
        ]}
      />
    );

    await waitFor(() => expect(dynamicMapMock).toHaveBeenCalled());

    const call = dynamicMapMock.mock.calls[dynamicMapMock.mock.calls.length - 1]![0] as {
      contentItems: Array<{ item: { id: string }; categorySlug: string }>;
    };
    expect(call.contentItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ categorySlug: 'moments', item: expect.objectContaining({ id: 'museum' }) }),
      expect.objectContaining({ categorySlug: 'phones', item: expect.objectContaining({ id: 'police' }) }),
      expect.objectContaining({ categorySlug: 'phones', item: expect.objectContaining({ id: 'emergency-112' }) }),
    ]));
  });
});
