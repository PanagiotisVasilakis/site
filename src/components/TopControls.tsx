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

// --- Styles with CVA ---

const navButton = cva(
  "inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide leading-none transition whitespace-nowrap white-in-dark",
  {
    variants: {
      intent: {
        primary: "shadow-md bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70",
        secondary: "border border-white/30 dark:border-white/40 bg-white/30 hover:bg-white/60 dark:bg-white/40 dark:hover:bg-white/60 text-slate-800 shadow-sm font-medium",
        mobileItem: "w-full px-3 py-2.5 justify-start bg-slate-100 hover:bg-white text-slate-900 shadow-sm border border-slate-300 dark:bg-white/10 dark:backdrop-blur-md dark:hover:bg-white/20 dark:text-white dark:border-white/10"
      },
      active: {
        true: "ring-2 ring-brand-400"
      }
    },
    defaultVariants: {
      intent: "primary"
    }
  }
);

const menuPanel = cva(
  "fixed top-12 right-3 z-40 w-60 rounded-2xl mobile-menu-panel shadow-lg p-4 flex flex-col gap-4 transition-transform origin-top-right bg-white text-slate-900 dark:bg-black dark:text-white",
  {
    variants: {
      open: {
        true: "scale-100 opacity-100",
        false: "scale-95 opacity-0 pointer-events-none"
      }
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

  // Custom Hooks
  const { scrolled, hidden } = useScroll();
  const { isSignedIn, signOut } = useGuestSession({
    initialIsSignedIn: !!showCheckIn,
    // Only check session on check-in related pages to save resources/bandwidth
    enabled: pathname?.includes('/check-in')
  });

  const shouldShowCheckIn = isSignedIn && pathname?.includes('/check-in');

  // Analytics helper (lazy load)
  const trackAnalyticsEvent = (eventName: string, props?: Record<string, unknown>) => {
    import('@/lib/analyticsClient')
      .then(m => m.trackEvent(eventName, props))
      .catch(() => { });
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = `/${locale}`;
  };

  // Close menu on outside click
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

  // Handle Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mobileMenuLinks = useMemo(() => {
    const links = [
      { href: `/${locale}/house`, label: dictionary.house?.navLabel ?? dictionary.house?.title ?? 'House Guide', icon: '📘', event: 'mobile_nav_house' },
      { href: `/${locale}/book`, label: dictionary.cta?.reserve ?? 'Book stay', icon: '🗓️', event: 'mobile_nav_book' },
      { href: `/${locale}/booking-details`, label: dictionary.bookingDetails ?? 'Booking Details', icon: '📋', event: 'mobile_nav_booking_details' },
      { href: `/${locale}/about`, label: dictionary.aboutUs ?? 'About Us', icon: 'ℹ️', event: 'mobile_nav_about' },
      { href: `/${locale}/favorites`, label: dictionary.labels?.favorites ?? 'Favorites', icon: '⭐', event: 'mobile_nav_favorites' },
      { href: `/${locale}?category=restaurants`, label: dictionary.categories?.restaurants ?? 'Kalamata Moments', icon: '🍽️', event: 'mobile_nav_restaurants' },
      { href: `/${locale}?category=phones`, label: dictionary.categories?.phones ?? 'Important Phones', icon: '📞', event: 'mobile_nav_phones' },
    ];

    if (shouldShowCheckIn) {
      links.push({ href: `/${locale}/check-in`, label: 'Check‑in', icon: '✓', event: 'mobile_nav_checkin' });
    }
    return links.filter(l => Boolean(l.label));
  }, [locale, dictionary, shouldShowCheckIn]);

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
          "flex items-center justify-between gap-1 rounded-full px-1.5 py-0.5 h-auto overflow-hidden backdrop-blur transition-colors",
          "bg-white/12 dark:bg-white/25 border",
          scrolled ? "shadow-md border-[color:var(--border-soft,#e5e7eb)]" : "shadow-sm border-transparent"
        )}>
          {/* Home Link */}
          <Link
            href={`/${locale}`}
            className={clsx(navButton({ intent: 'primary' }), "group min-w-0 max-w-fit focus:outline-none focus-visible:ring-2 ring-brand-400/60")}
            aria-label="Home"
          >
            <span className="text-sm leading-none flex-shrink-0" aria-hidden>🏠</span>
            <span className="truncate max-w-[200px] text-[11px]" title={appTitle}>{appTitle}</span>
            <small className="hidden sm:inline text-[10px] font-normal opacity-60 flex-shrink-0 text-[color:var(--text-accent-subtle)]"></small>
          </Link>

          <div className="flex items-center gap-1">
            {/* Desktop Controls */}
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
                  Check‑in
                </Link>
              )}
            </div>

            {/* Menu Trigger */}
            <button
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
              className={clsx(
                "h-7 w-7 rounded-full flex items-center justify-center transition border text-sm shadow-sm flex-shrink-0",
                "bg-white/30 dark:bg-white/40 hover:bg-white/60 dark:hover:bg-white/60 border-white/30 dark:border-white/40",
                open && "ring-2 ring-brand-400"
              )}
            >
              <span aria-hidden>{open ? '×' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Panel */}
        <div className={menuPanel({ open })} role="menu" aria-label="Main menu">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-700/60">
            <span className="text-xs font-bold tracking-wide uppercase">Menu</span>
            <div className="flex items-center gap-2">
              <div className="dark:border dark:border-zinc-700/60 rounded-full"><ThemeToggle /></div>
              <div className="dark:border dark:border-zinc-700/60 rounded-full"><LocaleSwitcher /></div>
            </div>
          </div>

          <nav className="flex flex-col gap-2" aria-label="Primary pages">
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

          <div className="md:hidden flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-zinc-700/60">
            {isSignedIn ? (
              <button
                onClick={() => { handleSignOut(); setOpen(false); }}
                className={navButton({ intent: 'mobileItem' })}
              >
                <span aria-hidden className="text-base leading-none">👤</span>
                <span className="flex-1 text-left">{dictionary.ui?.signOut || "Sign out"}</span>
              </button>
            ) : (
              <Link
                href={`/${locale}/guest?mode=signin`}
                className={navButton({ intent: 'mobileItem' })}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden className="text-base leading-none">👤</span>
                <span className="flex-1 text-left">{dictionary.ui?.signIn || "Sign in"}</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}