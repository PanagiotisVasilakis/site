import type { Dictionary } from '@/i18n/dictionaries';
import type { MenuIconName } from '@/components/navigation/MenuIcons';

export interface MenuLink {
  href: string;
  label: string;
  icon: MenuIconName;
  event: string;
  group: 'stay' | 'explore';
  featured?: boolean;
}

export function buildMenuLinks(
  locale: string,
  dictionary: Dictionary,
  includeCheckIn: boolean,
): MenuLink[] {
  const links: MenuLink[] = [
    { href: `/${locale}/apartment`, label: dictionary.house?.navLabel ?? dictionary.house?.title ?? 'House Guide', icon: 'gallery', event: 'mobile_nav_house', group: 'stay' },
    { href: `/${locale}/book`, label: dictionary.cta?.reserve ?? 'Book stay', icon: 'calendar', event: 'mobile_nav_book', group: 'stay', featured: true },
    { href: `/${locale}/booking-details`, label: dictionary.bookingDetails ?? 'Booking Details', icon: 'booking', event: 'mobile_nav_booking_details', group: 'stay' },
    { href: `/${locale}/about`, label: dictionary.aboutUs ?? 'About Us', icon: 'about', event: 'mobile_nav_about', group: 'stay' },
    { href: `/${locale}/favorites`, label: dictionary.labels?.favorites ?? 'Favorites', icon: 'favorite', event: 'mobile_nav_favorites', group: 'explore' },
    { href: `/${locale}?category=moments`, label: dictionary.categories?.moments ?? 'Kalamata Moments', icon: 'moments', event: 'mobile_nav_moments', group: 'explore' },
    { href: `/${locale}?category=phones`, label: dictionary.categories?.phones ?? 'Important Phones', icon: 'phone', event: 'mobile_nav_phones', group: 'explore' },
  ];

  if (includeCheckIn) {
    links.splice(3, 0, {
      href: `/${locale}/check-in`,
      label: dictionary.checkin?.navLabel ?? 'Check‑in',
      icon: 'checkin',
      event: 'mobile_nav_checkin',
      group: 'stay',
    });
  }

  return links.filter((link) => Boolean(link.label));
}
