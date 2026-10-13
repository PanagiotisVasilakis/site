import { LEGACY_CLAIM_QUERY_PARAMS } from '@/components/guest/guestValidation';
import { locales } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries';
import { HOST_CONTACT } from '@/data/contact';
import { telHref } from '@/lib/contactLinks';

/** Header variants (identity §8, §9). The footer has only `marketing` and `stay`; guide pages use `marketing`. */
export type ShellVariant = 'marketing' | 'guide' | 'stay';
export type FooterVariant = 'marketing' | 'stay';

/**
 * The in-stay hub `/{l}/stay` (identity §9.4, R3-V9), without the locale prefix. "Your stay" and the stay
 * brand link go through this one constant.
 */
export const STAY_HUB_PATH = '/stay';

export interface ShellLink {
  key: string;
  href: string;
  label: string;
}

const MARKETING_ROUTES = new Set(['', 'apartment', 'availability']);
const STAY_ROUTES = new Set(['stay', 'guest', 'check-in', 'portal', 'offline']);
/**
 * Routes whose first section is a full-bleed photo: the header floats over it (negative bottom margin).
 * Only home: the apartment page starts with its page head (§9.2).
 */
const HERO_ROUTES = new Set(['']);

function firstSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && (locales as readonly string[]).includes(parts[0])) parts.shift();
  return parts[0] ?? '';
}

/** marketing: home, apartment, availability (/about redirects to the home page); stay: stay, guest, check-in, portal, offline; guide: the rest. */
export function shellVariantFor(pathname: string): ShellVariant {
  const first = firstSegment(pathname);
  if (MARKETING_ROUTES.has(first)) return 'marketing';
  if (STAY_ROUTES.has(first)) return 'stay';
  return 'guide';
}

export function footerVariantFor(variant: ShellVariant): FooterVariant {
  return variant === 'stay' ? 'stay' : 'marketing';
}

export function headerOverlaysHero(pathname: string): boolean {
  return HERO_ROUTES.has(firstSegment(pathname));
}

export function brandHref(variant: ShellVariant, locale: string): string {
  return variant === 'stay' ? `/${locale}${STAY_HUB_PATH}` : `/${locale}`;
}

/**
 * Header and menu navigation. The stay variant carries no booking or availability link (§9.4):
 * only "Your stay" and "Kalamata guide". The marketing and guide navigation ends with "Your stay", for guests
 * who start from the public site (the in-stay pages carry it as their first item).
 */
export function navLinks(variant: ShellVariant, locale: string, t: Dictionary): ShellLink[] {
  const guide: ShellLink = { key: 'guide', href: `/${locale}/moments`, label: t.shell.navGuide };
  if (variant === 'stay') {
    return [
      { key: 'stay', href: `/${locale}${STAY_HUB_PATH}`, label: t.ui.yourStay },
      guide,
    ];
  }
  return [
    { key: 'apartment', href: `/${locale}/apartment`, label: t.shell.navApartment },
    { key: 'availability', href: `/${locale}/availability`, label: t.shell.navAvailability },
    guide,
    { key: 'contact', href: `/${locale}#contact`, label: t.shell.navContact },
    { key: 'stay', href: `/${locale}${STAY_HUB_PATH}`, label: t.ui.yourStay },
  ];
}

/** The header call to action: marketing only. */
export function headerCta(variant: ShellVariant, locale: string, t: Dictionary): ShellLink | null {
  return variant === 'marketing'
    ? { key: 'check-dates', href: `/${locale}/availability`, label: t.shell.checkDates }
    : null;
}

/** Call and WhatsApp in the marketing menu (§8 MobileMenu). */
export function menuContactLinks(variant: ShellVariant, t: Dictionary): ShellLink[] {
  if (variant !== 'marketing') return [];
  const tel = telHref(HOST_CONTACT.phone);
  return [
    ...(tel ? [{ key: 'call', href: tel, label: t.cta.call }] : []),
    { key: 'whatsapp', href: HOST_CONTACT.whatsapp, label: t.shell.whatsapp },
  ];
}

/** Footer contact rows (marketing footer only). */
export function footerContactLinks(variant: FooterVariant, t: Dictionary): ShellLink[] {
  if (variant !== 'marketing') return [];
  const tel = telHref(HOST_CONTACT.phone);
  return [
    ...(tel ? [{ key: 'phone', href: tel, label: HOST_CONTACT.phone }] : []),
    { key: 'email', href: `mailto:${HOST_CONTACT.email}`, label: HOST_CONTACT.email },
    { key: 'instagram', href: HOST_CONTACT.instagram, label: t.shell.instagram },
    { key: 'whatsapp', href: HOST_CONTACT.whatsapp, label: t.shell.whatsapp },
  ];
}

/**
 * Footer navigation: the full nav plus "Your stay" in marketing; nothing in the slim stay footer. The footer shows
 * "Your stay" on its own (footerStayLink), so the nav list leaves that item out.
 */
export function footerNavLinks(variant: FooterVariant, locale: string, t: Dictionary): ShellLink[] {
  if (variant === 'stay') return [];
  return navLinks('marketing', locale, t).filter((link) => link.key !== 'stay');
}

export function footerStayLink(variant: FooterVariant, locale: string, t: Dictionary): ShellLink | null {
  return variant === 'marketing'
    ? { key: 'your-stay', href: `/${locale}${STAY_HUB_PATH}`, label: t.shell.footerStay }
    : null;
}

/**
 * The marketing footer's lines under the wordmark (identity §1.2, §8 SiteFooter): the primary tagline and the
 * location line of the hero lede, both owner-approved R3-C1 copy. None in the slim stay footer.
 */
export function footerBrandLines(variant: FooterVariant, t: Dictionary): { tagline: string; place: string } | null {
  return variant === 'marketing' ? { tagline: t.home.heroTagline, place: t.home.heroFacts } : null;
}

/**
 * The id of the footer's contact block: `contact` on the home page only. Every "Contact" link points to
 * `/{l}#contact` (navLinks, ApartmentCta, ErrorSummary, the guest page); other pages leave the id out, so the
 * availability page's own `#contact` section stays the only one there.
 */
export function footerContactId(pathname: string): string | undefined {
  return firstSegment(pathname) === '' ? 'contact' : undefined;
}

/** Legal links: in both footer variants, so every page reaches the privacy notice (R3-L2). */
export function footerLegalLinks(locale: string, t: Dictionary): ShellLink[] {
  return [{ key: 'privacy', href: `/${locale}/privacy`, label: t.legal.privacyLink }];
}

/** A link is the current page when the path matches it exactly or is below it. Hash links never are. */
export function isCurrentLink(pathname: string, href: string): boolean {
  if (href.includes('#') || !href.startsWith('/')) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The part of a click that scrollToCurrentHash reads (React's MouseEvent has all of it). */
interface LinkClick {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

/**
 * The onClick of a nav link (header, menu, footer). next/link scrolls to a hash only when the hash changes, so a
 * click on `/{l}#contact` while the URL already ends in `#contact` did nothing (R-689, decision D13). In exactly
 * that case this prevents the navigation and scrolls to the target itself, without options: the page's CSS
 * decides how it scrolls (scroll-margin, no smooth scrolling, so reduced motion stays instant). Every other click
 * is left to next/link or the browser: other URLs, modified clicks and a target that is not on the page.
 */
export function scrollToCurrentHash(event: LinkClick, href: string): void {
  const hashAt = href.indexOf('#');
  if (hashAt < 0) return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (`${window.location.pathname}${window.location.hash}` !== href) return;
  const target = document.getElementById(href.slice(hashAt + 1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView();
}

/**
 * The same page in another locale (identity §8 LanguageSwitch, logic from the former LocaleSwitcher):
 * swaps or adds the locale segment and keeps the query and the hash. The legacy claim query names are
 * dropped: useSearchParams() does not see the guest client's history scrub, and a link must not put a
 * scrubbed value back (docs/security/claim-token-transport.md).
 */
export function localeSwitchHref(pathname: string, target: string, search = '', hash = ''): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && (locales as readonly string[]).includes(parts[0])) parts[0] = target;
  else parts.unshift(target);
  const params = new URLSearchParams(search);
  LEGACY_CLAIM_QUERY_PARAMS.forEach((name) => params.delete(name));
  const query = params.toString();
  const fragment = hash.replace(/^#/, '');
  return `/${parts.join('/')}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`;
}
