"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { BrandMark } from '@/components/icons/BrandMark';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useGuestSession } from '@/hooks/useGuestSession';
import { useScroll } from '@/hooks/useScroll';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { useMotionPreference } from '@/lib/motion/motionPreference';
import { usePointerEffects } from '@/lib/motion/pointerEffects';
import LanguageSwitch from './LanguageSwitch';
import MobileMenu from './MobileMenu';
import { ThemeSwitch } from './ThemeSwitch';
import { brandHref, headerCta, headerOverlaysHero, isCurrentLink, navLinks, shellVariantFor } from './shellLinks';

/** The wordmark (identity §1.2): the brand in every locale; the place label below it is localized. */
const WORDMARK = 'Dolce Far Niente';

/**
 * identity §8 SiteHeader: a sticky glass pill with the brand, the nav (≥ lg), the language and theme
 * switches, the marketing CTA (≥ sm) and the menu button (< lg). The variant follows the route
 * (shellVariantFor). It also keeps `data-motion` in sync (useMotionPreference, §5.2) and mounts the
 * pointer effects (tilt, magnetic buttons; not on the calm stay routes). R3-V14: the marketing header
 * carries the scroll-progress hairline (M31), and the brand mark's intro (M26) ends by removing the boot
 * script's `data-intro`, so a remounted header does not play it again.
 */
export default function SiteHeader({ locale }: { locale: string }) {
  const pathname = usePathname() || `/${locale}`;
  const router = useRouter();
  const t = getDictionary(normalizeLocale(locale));
  const variant = shellVariantFor(pathname);
  const cta = headerCta(variant, locale, t);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  const { scrolled } = useScroll(24);
  const { isSignedIn, signOut } = useGuestSession();
  useMotionPreference();
  usePointerEffects(variant !== 'stay');

  // M26: the intro ends with the sun; without data-intro a remounted header (locale switch) stays still.
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-intro')) return undefined;
    const onEnd = (event: AnimationEvent) => {
      if (event.animationName === 'brand-sun-rise') root.removeAttribute('data-intro');
    };
    document.addEventListener('animationend', onEnd);
    return () => document.removeEventListener('animationend', onEnd);
  }, []);

  // A navigation closes the menu.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  const handleSignOut = async () => {
    if (await signOut()) {
      router.replace(`/${locale}`);
      router.refresh();
    }
  };

  return (
    <>
      <header
        className={clsx(
          'site-header',
          `site-header--${variant}`,
          headerOverlaysHero(pathname) && 'site-header--overlay',
          scrolled && 'is-scrolled',
        )}
      >
        <Link href={brandHref(variant, locale)} className="site-brand shell-link">
          <BrandMark className="site-brand__mark" />
          <span className="site-brand__text">
            <span className="site-brand__name">{WORDMARK}</span>
            <span className="site-brand__place">{variant === 'stay' ? t.ui.yourStay : t.shell.brandPlace}</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label={t.ui.primaryNavigation}>
          {navLinks(variant, locale, t).map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="site-nav__link shell-link"
              aria-current={isCurrentLink(pathname, link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__tools">
          <LanguageSwitch locale={locale} label={t.shell.language} className="site-header__lang" />
          <ThemeSwitch t={t.shell} />
          {cta && (
            <Button asChild variant="primary" size="sm" className="site-header__cta shell-link">
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          )}
          {variant === 'stay' && isSignedIn && (
            <Button variant="ghost" size="sm" className="site-header__account" onClick={() => void handleSignOut()}>
              {t.ui.signOut}
            </Button>
          )}
          <IconButton
            ref={triggerRef}
            label={t.ui.menu}
            className="site-header__menu-btn"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" size={20} />
          </IconButton>
        </div>
        {variant === 'marketing' ? <span className="site-header__progress" aria-hidden="true" /> : null}
      </header>
      <MobileMenu
        id={menuId}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        locale={locale}
        pathname={pathname}
        variant={variant}
        t={t}
        isSignedIn={isSignedIn}
        onSignOut={() => void handleSignOut()}
      />
    </>
  );
}
