import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
    const { container } = render(
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

    expect(container.querySelector('main')).toBeNull();

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

  it('renders Wi-Fi credentials only after the authenticated preferences response', async () => {
    internalFetchMock.mockImplementation(async (input: string) => {
      if (input === '/api/check-in/preferences') {
        return {
          ok: true,
          json: async () => ({
            data: {
              checkInTime: '15:00',
              checkOutTime: '11:00',
              wifi: { network: 'GuestNetwork', password: 'private-password' },
            },
          }),
        };
      }
      return { ok: false };
    });

    render(<CheckInInfo locale="en" />);

    expect(screen.queryByText('private-password')).not.toBeInTheDocument();
    expect(await screen.findByText('private-password')).toBeInTheDocument();
    expect(screen.getAllByText('GuestNetwork').length).toBeGreaterThan(0);
  });
});
