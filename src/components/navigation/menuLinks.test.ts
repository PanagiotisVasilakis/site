import { getDictionary } from '@/i18n/dictionaries';
import { buildMenuLinks } from '@/components/navigation/menuLinks';

describe('buildMenuLinks', () => {
  it('uses canonical localized routes and preserves every public destination', () => {
    const links = buildMenuLinks('el', getDictionary('el'), false);

    expect(links.map((link) => link.href)).toEqual([
      '/el/apartment',
      '/el/book',
      '/el/booking-details',
      '/el/about',
      '/el/favorites',
      '/el/moments',
      '/el/phones',
    ]);
    expect(links.find((link) => link.href === '/el/book')?.featured).toBe(true);
  });

  it('adds check-in access only for a verified guest', () => {
    const links = buildMenuLinks('en', getDictionary('en'), true);
    const checkIn = links.find((link) => link.href === '/en/check-in');

    expect(checkIn).toMatchObject({
      icon: 'checkin',
      event: 'mobile_nav_checkin',
      group: 'stay',
    });
  });
});
