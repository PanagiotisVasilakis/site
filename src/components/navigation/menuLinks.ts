import type { Dictionary } from '@/i18n/dictionaries';
import type { MenuIconName } from '@/components/navigation/MenuIcons';

export interface MenuLink {
  href: string;
  label: string;
  icon: MenuIconName;
  group: 'stay' | 'explore';
  featured?: boolean;
}

export function buildMenuLinks(
  locale: string,
  dictionary: Dictionary,
  includeCheckIn: boolean,
): MenuLink[] {
  const links: MenuLink[] = [
    { href: `/${locale}/apartment`, label: dictionary.house.navLabel, icon: 'gallery', group: 'stay' },
    { href: `/${locale}/book`, label: dictionary.cta.reserve, icon: 'calendar', group: 'stay', featured: true },
    { href: `/${locale}/booking-details`, label: dictionary.bookingDetails, icon: 'booking', group: 'stay' },
    { href: `/${locale}/about`, label: dictionary.aboutUs, icon: 'about', group: 'stay' },
    { href: `/${locale}/favorites`, label: dictionary.labels.favorites, icon: 'favorite', group: 'explore' },
    { href: `/${locale}/moments`, label: dictionary.categories.moments, icon: 'moments', group: 'explore' },
    { href: `/${locale}/phones`, label: dictionary.categories.phones, icon: 'phone', group: 'explore' },
  ];

  if (includeCheckIn) {
    links.splice(3, 0, {
      href: `/${locale}/check-in`,
      label: dictionary.checkin.navLabel,
      icon: 'checkin',
      group: 'stay',
    });
  }

  return links.filter((link) => Boolean(link.label));
}
