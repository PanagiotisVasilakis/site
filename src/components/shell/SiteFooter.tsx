"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { BrandMark } from '@/components/icons/BrandMark';
import { Icon, type IconName } from '@/components/icons/Icon';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import LanguageSwitch from './LanguageSwitch';
import { MotionSwitch } from './MotionSwitch';
import { ThemeSetting } from './ThemeSwitch';
import {
  footerContactLinks, footerLegalLinks, footerNavLinks, footerStayLink, footerVariantFor, shellVariantFor,
} from './shellLinks';

const CONTACT_ICONS: Record<string, IconName> = { phone: 'phone', email: 'mail', instagram: 'camera', whatsapp: 'message' };

/**
 * identity §8 SiteFooter. Marketing (also on guide pages): brand, nav, contact, "Your stay", MotionSwitch,
 * LanguageSwitch. Stay: MotionSwitch and LanguageSwitch only (no booking or availability link). Both also
 * carry the theme Segmented (see the note at the prefs) and the Privacy link (R3-L2).
 * The address/legal identity waits for its data (R3-L1): no placeholder is rendered (§1.4).
 */
export default function SiteFooter({ locale }: { locale: string }) {
  const pathname = usePathname() || `/${locale}`;
  const t = getDictionary(normalizeLocale(locale));
  const variant = footerVariantFor(shellVariantFor(pathname));
  const nav = footerNavLinks(variant, locale, t);
  const contact = footerContactLinks(variant, t);
  const stay = footerStayLink(variant, locale, t);
  const legal = footerLegalLinks(locale, t);

  return (
    <footer className={clsx('site-footer', `site-footer--${variant}`)}>
      <svg className="site-footer__waves" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 20c50 0 50-14 100-14s50 14 100 14 50-14 100-14 50 14 100 14 50-14 100-14 50 14 100 14 50-14 100-14 50 14 100 14 50-14 100-14 50 14 100 14 50-14 100-14 50 14 100 14 50-14 100-14 50 14 100 14" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="site-footer__inner">
        <p className="site-footer__brand">
          <BrandMark className="site-brand__mark" />
          <span className="site-brand__name">Dolce Far Niente</span>
        </p>

        {nav.length > 0 && (
          <nav className="site-footer__nav" aria-label={t.shell.footerNavigation}>
            {nav.map((link) => (
              <Link key={link.key} href={link.href} className="site-footer__link shell-link">{link.label}</Link>
            ))}
          </nav>
        )}

        {contact.length > 0 && (
          <div className="site-footer__contact">
            <p className="site-footer__heading">{t.shell.footerContact}</p>
            <ul className="site-footer__list">
              {contact.map((link) => (
                <li key={link.key} className="site-footer__item">
                  <a
                    href={link.href}
                    className="site-footer__link shell-link"
                    {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <Icon name={CONTACT_ICONS[link.key] ?? 'info'} size={20} />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stay && (
          <Link href={stay.href} className="site-footer__stay shell-link">
            {stay.label}
            <Icon name="arrow-right" size={20} />
          </Link>
        )}

        <div className="site-footer__prefs">
          {/* Deviation from §8 (owner to confirm): the header icon only toggles Day/Night and the menu
              button is hidden at ≥ 1280 px, so the footer also carries Auto · Day · Night at every width. */}
          <ThemeSetting t={t.shell} />
          <MotionSwitch t={t.shell} />
          <LanguageSwitch locale={locale} label={t.shell.language} />
        </div>

        <p className="site-footer__legal">
          {legal.map((link) => (
            <Link key={link.key} href={link.href} className="site-footer__link shell-link">{link.label}</Link>
          ))}
        </p>
      </div>
    </footer>
  );
}
