"use client";
import React, { useEffect, useRef, useState, useMemo } from 'react';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { cva } from 'class-variance-authority';
import clsx from 'clsx';
import { useScroll } from '@/hooks/useScroll';
import { useGuestSession } from '@/hooks/useGuestSession';
import {
  ChevronIcon,
  MenuGlyph,
  MenuIcon,
} from '@/components/navigation/MenuIcons';
import { buildMenuLinks } from '@/components/navigation/menuLinks';

const navButton = cva(
  "inline-flex items-center justify-center gap-2 px-3 py-2 md:py-1 min-h-11 md:min-h-8 rounded-full text-[11px] font-semibold leading-none transition whitespace-nowrap white-in-dark",
  {
    variants: {
      intent: {
        primary: "shadow-md bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70",
        secondary: "border border-white/30 dark:border-white/40 bg-white/30 hover:bg-white/60 dark:bg-white/40 dark:hover:bg-white/60 text-slate-800 shadow-sm font-medium"
      }
    },
    defaultVariants: {
      intent: "primary"
    }
  }
);

interface TopControlsProps {
  locale: string;
  appTitle: string;
  showCheckIn?: boolean;
}

export default function TopControls({ locale, appTitle, showCheckIn = false }: TopControlsProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dictionary = useMemo(() => getDictionary(locale as Locale), [locale]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = 'guest-navigation-panel';
  const menuLabels = dictionary.ui;

  const { scrolled, hidden } = useScroll();
  const { isSignedIn, signOut } = useGuestSession({
    initialIsSignedIn: !!showCheckIn,
  });

  const shouldShowCheckIn = isSignedIn;

  const trackAnalyticsEvent = (eventName: string, props?: Record<string, unknown>) => {
    import('@/lib/analyticsClient')
      .then(m => m.trackEvent(eventName, props))
      .catch(() => { });
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = `/${locale}`;
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu(true);
      return;
    }
    setOpen(true);
    window.setTimeout(() => closeButtonRef.current?.focus(), 50);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const mobileMenuLinks = useMemo(
    () => buildMenuLinks(locale, dictionary, shouldShowCheckIn),
    [locale, dictionary, shouldShowCheckIn],
  );

  const stayLinks = mobileMenuLinks.filter(link => link.group === 'stay');
  const exploreLinks = mobileMenuLinks.filter(link => link.group === 'explore');
  const isCurrentPage = (href: string) => {
    const hrefPath = href.split('?')[0];
    return hrefPath !== `/${locale}` && pathname === hrefPath;
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const renderMenuLink = (link: (typeof mobileMenuLinks)[number]) => {
    const active = isCurrentPage(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={clsx("guest-menu-link", link.featured && "is-featured", active && "is-active")}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          if (link.event) trackAnalyticsEvent(link.event, { destination: link.href });
          setOpen(false);
        }}
      >
        <span className="guest-menu-link-icon"><MenuIcon name={link.icon} /></span>
        <span className="guest-menu-link-label">{link.label}</span>
        <span className="guest-menu-link-arrow"><ChevronIcon /></span>
      </Link>
    );
  };

  return (
    <header
      className={clsx(
        "fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none transition-transform duration-300",
        hidden ? "-translate-y-full" : "translate-y-0"
      )}
      aria-hidden={hidden || undefined}
      inert={hidden}
    >
      <div ref={containerRef} className="top-controls-compact w-full px-4 pt-2 pointer-events-auto">
        <div className={clsx(
          "top-controls-bar flex items-center justify-between gap-1 rounded-full px-1.5 py-0.5 h-auto overflow-hidden backdrop-blur transition-colors",
          "bg-white/12 dark:bg-white/25 border",
          scrolled ? "shadow-md border-[color:var(--border-soft,#e5e7eb)]" : "shadow-sm border-transparent"
        )}>
          {/* Home Link */}
          <Link
            href={`/${locale}`}
            className={clsx(navButton({ intent: 'primary' }), "group min-w-0 max-w-fit focus:outline-none focus-visible:ring-2 ring-brand-400/60")}
            aria-label={dictionary.cta?.home ?? 'Home'}
          >
            <span className="text-sm leading-none flex-shrink-0" aria-hidden>🏠</span>
            <span className="truncate max-w-[200px] text-[11px]" title={appTitle}>{appTitle}</span>
          </Link>

          <div className="flex items-center gap-1">
            <div className="hidden md:flex items-center gap-0.5 lg:gap-1">
              {isSignedIn ? (
                <button
                  onClick={handleSignOut}
                  className={navButton({ intent: 'primary' })}
                  title={dictionary.ui?.signOut || "Sign out"}
                >
                  <span aria-hidden className="text-sm leading-none flex-shrink-0">👤</span>
                  <span className="text-[11px]">{dictionary.ui?.signOut || "Sign out"}</span>
                </button>
              ) : (
                <Link
                  href={`/${locale}/guest?mode=signin`}
                  className={navButton({ intent: 'primary' })}
                  title={dictionary.ui?.signIn || "Sign in"}
                >
                  <span aria-hidden className="text-sm leading-none flex-shrink-0">👤</span>
                  <span className="text-[11px]">{dictionary.ui?.signIn || "Sign in"}</span>
                </Link>
              )}

              {shouldShowCheckIn && (
                <Link
                  href={`/${locale}/check-in`}
                  className={navButton({ intent: 'secondary' })}
                  onClick={() => trackAnalyticsEvent('checkin_nav_clicked')}
                >
                  {dictionary.checkin?.navLabel ?? 'Check‑in'}
                </Link>
              )}
            </div>

            <button
              ref={triggerRef}
              type="button"
              aria-label={open ? (menuLabels?.closeMenu || 'Close menu') : (menuLabels?.menu || 'Open menu')}
              aria-expanded={open}
              aria-controls={panelId}
              aria-haspopup="dialog"
              onClick={toggleMenu}
              className={clsx(
                "menu-trigger h-11 w-11 md:h-8 md:w-8 rounded-full flex items-center justify-center transition border text-sm shadow-sm flex-shrink-0",
                "bg-white/30 dark:bg-white/40 hover:bg-white/60 dark:hover:bg-white/60 border-white/30 dark:border-white/40",
                open && "ring-2 ring-brand-400"
              )}
            >
              <MenuGlyph open={open} />
            </button>
          </div>
        </div>

        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={menuLabels?.closeMenu || 'Close menu'}
          className={clsx("guest-menu-backdrop", open && "is-open")}
          onClick={() => closeMenu(true)}
        />

        <section
          ref={panelRef}
          id={panelId}
          className={clsx("mobile-menu-panel guest-menu-panel", open && "is-open")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${panelId}-title`}
          aria-hidden={!open}
          inert={!open}
          onKeyDown={handlePanelKeyDown}
        >
          <header className="guest-menu-header">
            <Link href={`/${locale}`} className="guest-menu-brand" onClick={() => setOpen(false)}>
              <span className="guest-menu-monogram" aria-hidden>DF</span>
              <span>
                <strong id={`${panelId}-title`}>{appTitle}</strong>
                <small>{menuLabels?.guestGuide || 'Your stay, at a glance'}</small>
              </span>
            </Link>
            <button
              ref={closeButtonRef}
              type="button"
              className="guest-menu-close"
              onClick={() => closeMenu(true)}
              aria-label={menuLabels?.closeMenu || 'Close menu'}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="guest-menu-utilities" aria-label={menuLabels?.preferences || 'Preferences'}>
            <ThemeToggle
              className="guest-menu-utility"
              showText
              lightText={menuLabels?.lightMode || 'Light'}
              darkText={menuLabels?.darkMode || 'Dark'}
            />
            <LocaleSwitcher
              fullText
              showGlobeIcon
              className="guest-menu-utility"
            />
          </div>

          <div className="guest-menu-scroll">
            <nav className="guest-menu-nav" aria-label={menuLabels?.primaryNavigation || 'Primary navigation'}>
              <div className="guest-menu-group">
                <p className="guest-menu-eyebrow">{menuLabels?.yourStay || 'Your stay'}</p>
                <div className="guest-menu-links">
                  {stayLinks.map(renderMenuLink)}
                </div>
              </div>

              <div className="guest-menu-group">
                <p className="guest-menu-eyebrow">{menuLabels?.explore || 'Explore Kalamata'}</p>
                <div className="guest-menu-links">
                  {exploreLinks.map(renderMenuLink)}
                </div>
              </div>
            </nav>
          </div>

          <footer className="guest-menu-footer">
            {isSignedIn ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void handleSignOut();
                }}
                className="guest-menu-account"
              >
                <span className="guest-menu-account-icon"><MenuIcon name="user" /></span>
                <span>
                  <small>{menuLabels?.account || 'Guest account'}</small>
                  <strong>{menuLabels?.signOut || "Sign out"}</strong>
                </span>
                <span className="guest-menu-link-arrow"><ChevronIcon /></span>
              </button>
            ) : (
              <Link
                href={`/${locale}/guest?mode=signin`}
                className="guest-menu-account"
                onClick={() => setOpen(false)}
              >
                <span className="guest-menu-account-icon"><MenuIcon name="user" /></span>
                <span>
                  <small>{menuLabels?.account || 'Guest account'}</small>
                  <strong>{menuLabels?.signIn || "Sign in"}</strong>
                </span>
                <span className="guest-menu-link-arrow"><ChevronIcon /></span>
              </Link>
            )}
          </footer>
        </section>
      </div>
    </header>
  );
}
