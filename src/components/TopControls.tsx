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

type MenuIconName =
  | 'gallery'
  | 'calendar'
  | 'booking'
  | 'about'
  | 'favorite'
  | 'moments'
  | 'phone'
  | 'checkin'
  | 'user';

interface MenuLink {
  href: string;
  label: string;
  icon: MenuIconName;
  event: string;
  group: 'stay' | 'explore';
  featured?: boolean;
}

function MenuIcon({ name }: { name: MenuIconName }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'gallery':
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4.5 3.2 3.2 2.3-2.3 4 3.6" /></svg>;
    case 'calendar':
      return <svg {...commonProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m8.5 15 2 2 5-5" /></svg>;
    case 'booking':
      return <svg {...commonProps}><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6M9 12h6" /></svg>;
    case 'about':
      return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>;
    case 'favorite':
      return <svg {...commonProps}><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" /></svg>;
    case 'moments':
      return <svg {...commonProps}><path d="M7 3v7a3 3 0 0 1-3 3V3M7 3v18M17 3v18M17 3c2.2 2.1 3 4.3 3 6.5S18.7 13 17 13" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case 'phone':
      return <svg {...commonProps}><path d="M7.2 3.5 10 7.8 7.9 10a16.2 16.2 0 0 0 6.1 6.1l2.2-2.1 4.3 2.8-.8 3a2 2 0 0 1-2 1.5C9.4 20.5 3.5 14.6 2.7 6.3a2 2 0 0 1 1.5-2l3-.8Z" /></svg>;
    case 'checkin':
      return <svg {...commonProps}><path d="M4 12.5 9 17l11-11" /></svg>;
    case 'user':
      return <svg {...commonProps}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  }
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="m7.5 4.5 5 5.5-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className="menu-trigger-glyph" aria-hidden>
      <span className={clsx("menu-trigger-line", open && "is-open")} />
      <span className={clsx("menu-trigger-line", open && "is-open")} />
    </span>
  );
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
    // Only check session on check-in related pages to save resources/bandwidth
    enabled: pathname?.includes('/check-in')
  });

  const shouldShowCheckIn = isSignedIn && pathname?.includes('/check-in');

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

  const mobileMenuLinks = useMemo(() => {
    const links: MenuLink[] = [
      { href: `/${locale}/house`, label: dictionary.house?.navLabel ?? dictionary.house?.title ?? 'House Guide', icon: 'gallery', event: 'mobile_nav_house', group: 'stay' },
      { href: `/${locale}/book`, label: dictionary.cta?.reserve ?? 'Book stay', icon: 'calendar', event: 'mobile_nav_book', group: 'stay', featured: true },
      { href: `/${locale}/booking-details`, label: dictionary.bookingDetails ?? 'Booking Details', icon: 'booking', event: 'mobile_nav_booking_details', group: 'stay' },
      { href: `/${locale}/about`, label: dictionary.aboutUs ?? 'About Us', icon: 'about', event: 'mobile_nav_about', group: 'stay' },
      { href: `/${locale}/favorites`, label: dictionary.labels?.favorites ?? 'Favorites', icon: 'favorite', event: 'mobile_nav_favorites', group: 'explore' },
      { href: `/${locale}?category=moments`, label: dictionary.categories?.moments ?? 'Kalamata Moments', icon: 'moments', event: 'mobile_nav_moments', group: 'explore' },
      { href: `/${locale}?category=phones`, label: dictionary.categories?.phones ?? 'Important Phones', icon: 'phone', event: 'mobile_nav_phones', group: 'explore' },
    ];

    if (shouldShowCheckIn) {
<<<<<<< HEAD
      links.splice(3, 0, {
        href: `/${locale}/check-in`,
        label: 'Check‑in',
        icon: 'checkin',
        event: 'mobile_nav_checkin',
        group: 'stay',
        featured: false,
      });
=======
      links.push({ href: `/${locale}/check-in`, label: dictionary.checkin?.navLabel ?? 'Check‑in', icon: '✓', event: 'mobile_nav_checkin' });
>>>>>>> 430442a31b6b7b701ebd6c42f2511f661d11f85f
    }
    return links.filter(l => Boolean(l.label));
  }, [locale, dictionary, shouldShowCheckIn]);

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
    <div
      className={clsx(
        "fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none transition-transform duration-300",
        hidden ? "-translate-y-full" : "translate-y-0"
      )}
      aria-hidden={hidden}
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
            <small className="hidden sm:inline text-[10px] font-normal opacity-60 flex-shrink-0 text-[color:var(--text-accent-subtle)]"></small>
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
<<<<<<< HEAD
              ref={triggerRef}
              type="button"
              aria-label={open ? (menuLabels?.closeMenu || 'Close menu') : (menuLabels?.menu || 'Open menu')}
=======
              aria-label={dictionary.ui?.menu ?? 'Menu'}
>>>>>>> 430442a31b6b7b701ebd6c42f2511f661d11f85f
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

<<<<<<< HEAD
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
=======
        {/* Mobile Panel */}
        <div className={menuPanel({ open })} role="menu" aria-label={dictionary.ui?.mainMenu ?? 'Main menu'}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-700/60">
            <span className="text-xs font-bold uppercase">{dictionary.ui?.menu ?? 'Menu'}</span>
            <div className="flex items-center gap-2">
              <div className="dark:border dark:border-zinc-700/60 rounded-full"><ThemeToggle /></div>
              <div className="dark:border dark:border-zinc-700/60 rounded-full"><LocaleSwitcher /></div>
            </div>
          </div>

          <nav className="flex flex-col gap-2" aria-label={dictionary.ui?.primaryPages ?? 'Primary pages'}>
            {mobileMenuLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={navButton({ intent: 'mobileItem' })}
                onClick={() => {
                  if (link.event) trackAnalyticsEvent(link.event, { destination: link.href });
                  setOpen(false);
                }}
              >
                <span aria-hidden className="text-base leading-none w-6 text-center">{link.icon}</span>
                <span className="flex-1 text-left">{link.label}</span>
              </Link>
            ))}
          </nav>
>>>>>>> 430442a31b6b7b701ebd6c42f2511f661d11f85f

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
    </div>
  );
}
