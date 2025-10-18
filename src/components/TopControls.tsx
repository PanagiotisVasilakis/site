"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { onGuestSessionChange } from '@/lib/sessionSignals';
import internalFetch from '@/lib/internalFetchClient';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

interface TopControlsProps {
  locale: string;
  appTitle: string;
  showCheckIn?: boolean;
}
export default function TopControls({ locale, appTitle, showCheckIn = false }: TopControlsProps) {
  const [open, setOpen] = useState(false); // mobile menu expanded
  const [hidden, setHidden] = useState(false); // auto-hide on scroll down
  const [scrolled, setScrolled] = useState(false); // add shadow
  const lastY = useRef(0);
  const [checkInVisible, setCheckInVisible] = useState(!!showCheckIn);
  const [isSignedIn, setIsSignedIn] = useState(!!showCheckIn); // Track if user is signed in
  const checkerRef = useRef<number | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const dictionary = useMemo(() => getDictionary(locale as Locale), [locale]);

  const handleSignOut = useCallback(async () => {
    try {
      // Call logout API to clear cookies
      await internalFetch('/api/portal/logout', { method: 'POST' });
      setIsSignedIn(false);
      setCheckInVisible(false);
      // Redirect to home page
      window.location.href = `/${locale}`;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [locale]);

  // Refresh on route changes too for instant feedback
  const pathname: string | null = usePathname?.() ?? null;

  const refreshCheckIn = useCallback(async () => {
    // Only check authentication when on check-in page or trying to access it
    if (!pathname?.includes('/check-in')) {
      setCheckInVisible(false);
      setIsSignedIn(false);
      return;
    }
    
    try {
      // Avoid overlapping calls
      inFlight.current?.abort();
      const ac = new AbortController();
      inFlight.current = ac;
      const res = await internalFetch('/api/check-in', { method: 'GET', signal: ac.signal, headers: { 'cache-control': 'no-cache' } });
      const ok = res.ok; // 200 when session verified; 401 otherwise via handler
      setCheckInVisible(ok);
      setIsSignedIn(ok);
    } catch {
      // Network or aborted -> treat as not visible
      setCheckInVisible(false);
      setIsSignedIn(false);
    }
  }, [pathname]);
  useEffect(() => {
    if (pathname != null) refreshCheckIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const onScroll = useCallback(() => {
    const y = window.scrollY || 0;
    setScrolled(y > 4);
    const delta = y - lastY.current;
    // Hide when scrolling down past threshold, show when scrolling up
    if (y > 80 && delta > 10) {
      setHidden(true);
      setOpen(false);
    } else if (delta < -10) {
      setHidden(false);
    }
    lastY.current = y;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Helper to track analytics events
  const trackAnalyticsEvent = useCallback((eventName: string, props?: Record<string, unknown>) => {
    import('@/lib/analyticsClient')
      .then(m => m.trackEvent(eventName, props))
      .catch(() => {}); // Silent fail for analytics
  }, []);

  const mobileMenuLinks = useMemo(() => {
    const links = [
      {
        href: `/${locale}/house`,
        label: dictionary.house?.navLabel ?? dictionary.house?.title ?? 'House Guide',
        icon: '📘',
        event: 'mobile_nav_house',
      },
      {
        href: `/${locale}/property`,
        label: dictionary.details ?? 'Property',
        icon: '🏖️',
        event: 'mobile_nav_property',
      },
      {
        href: `/${locale}/book`,
        label: dictionary.cta?.reserve ?? 'Book stay',
        icon: '🗓️',
        event: 'mobile_nav_book',
      },
      {
        href: `/${locale}/favorites`,
        label: dictionary.labels?.favorites ?? 'Favorites',
        icon: '⭐',
        event: 'mobile_nav_favorites',
      },
      {
        href: `/${locale}?category=restaurants`,
        label: dictionary.categories?.restaurants ?? 'Kalamata Moments',
        icon: '🍽️',
        event: 'mobile_nav_restaurants',
      },
      {
        href: `/${locale}?category=phones`,
        label: dictionary.categories?.phones ?? 'Important Phones',
        icon: '📞',
        event: 'mobile_nav_phones',
      },
    ];

    // Add Check-in link when user is signed in
    if (isSignedIn && checkInVisible) {
      links.push({
        href: `/${locale}/check-in`,
        label: 'Check‑in',
        icon: '✓',
        event: 'mobile_nav_checkin',
      });
    }

    return links.filter(link => Boolean(link.label));
  }, [locale, dictionary, isSignedIn, checkInVisible]);

  // Hydrate visibility from server flag; keep client state in sync with SSR hint
  useEffect(() => {
    const serverCheckInVisible = !!showCheckIn;
    setCheckInVisible(serverCheckInVisible);
    setIsSignedIn(serverCheckInVisible);
    const name = serverCheckInVisible ? 'checkin_nav_shown' : 'checkin_nav_hidden';
    trackAnalyticsEvent(name, { reason: 'server_session', locale });
    
    // Only call refreshCheckIn if we're on the check-in page
    if (pathname?.includes('/check-in')) {
      refreshCheckIn();
    }
  }, [showCheckIn, locale, trackAnalyticsEvent, pathname, refreshCheckIn]);

  // Update on page visibility/focus and periodically to reflect session changes (only when on check-in page)
  useEffect(() => {
    // Only set up polling and event listeners when on check-in page
    if (!pathname?.includes('/check-in')) {
      return;
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') refreshCheckIn();
    }
    function onFocus() {
      refreshCheckIn();
    }
    // Instant cross-tab reaction on explicit logout/rotation events
    const unsubscribe = onGuestSessionChange(() => {
      // Revalidate immediately
      refreshCheckIn();
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    // Periodic poll (lightweight) to catch silent expiry - only when on check-in page
    checkerRef.current = window.setInterval(refreshCheckIn, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      unsubscribe?.();
      if (checkerRef.current) window.clearInterval(checkerRef.current);
      inFlight.current?.abort();
    };
  }, [refreshCheckIn, pathname]);

  // Close menu on outside click (mobile)
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const baseNavButtonClasses = "inline-flex items-center justify-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide leading-none transition";
  const primaryNavButtonClasses = `${baseNavButtonClasses} shadow-md bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70 [&]:dark:!text-white [&>*]:dark:!text-white`;
  const secondaryNavButtonClasses = `${baseNavButtonClasses} border border-white/30 dark:border-white/40 bg-white/30 hover:bg-white/60 dark:bg-white/40 dark:hover:bg-white/60 text-slate-800 [&]:dark:!text-white [&>*]:dark:!text-white font-medium shadow-sm`;

  return (
    <div className={`fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none transition-transform duration-300 ${hidden ? '-translate-y-full' : 'translate-y-0'}`} aria-hidden={hidden}>
    <div ref={containerRef} className="w-full px-4 pt-2 pointer-events-auto">
  <div className={`flex items-center justify-between gap-1.5 rounded-full px-1.5 py-0.5 backdrop-blur bg-white/12 dark:bg-white/25 border ${scrolled ? 'shadow-md border-[color:var(--border-soft,#e5e7eb)]' : 'shadow-sm border-transparent'} transition-colors`}>
          <Link href={`/${locale}`} className={`group shrink min-w-0 ${primaryNavButtonClasses} focus:outline-none focus-visible:ring-2 ring-brand-400/60 dark:focus-visible:ring-brand-400/50`} aria-label="Home">
            <span className="text-sm leading-none" aria-hidden>🏠</span>
            <span className="truncate max-w-[120px]" title={appTitle}>{appTitle}</span>
            <small id="current-version" className="hidden sm:inline text-[10px] font-normal opacity-60" style={{ color: 'var(--text-accent-subtle)' }}></small>
          </Link>
          <div className="flex items-center gap-2">
            {/* Desktop buttons */}
            <div className="hidden md:flex items-center gap-1.5">
              {isSignedIn ? (
                <button
                  onClick={handleSignOut}
                  className={primaryNavButtonClasses}
                  aria-label={getDictionary(locale as Locale).ui?.signOut || "Sign out"}
                  title={getDictionary(locale as Locale).ui?.signOut || "Sign out"}
                >
                  <span aria-hidden className="text-sm leading-none">👤</span>
                  <span>{getDictionary(locale as Locale).ui?.signOut || "Sign out"}</span>
                </button>
              ) : (
                <Link 
                  href={`/${locale}/guest?mode=signin`}
                  className={primaryNavButtonClasses}
                  aria-label={getDictionary(locale as Locale).ui?.signIn || "Sign in"}
                  title={getDictionary(locale as Locale).ui?.signIn || "Sign in"}
                >
                  <span aria-hidden className="text-sm leading-none">👤</span>
                  <span>{getDictionary(locale as Locale).ui?.signIn || "Sign in"}</span>
                </Link>
              )}
              <ThemeToggle />
              <LocaleSwitcher />
              {checkInVisible ? (
                <Link href={`/${locale}/check-in`} className={secondaryNavButtonClasses}
                  onClick={() => trackAnalyticsEvent('checkin_nav_clicked')}>
                  Check‑in
                </Link>
              ) : null}
              <button
                id="install-btn"
                className={secondaryNavButtonClasses}
                style={{ display: 'none' }}
              >
                Install
              </button>
            </div>
            {/* Menu trigger - visible on all screen sizes */}
            <div className="flex items-center">
              <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={`h-7 w-7 rounded-full flex items-center justify-center bg-white/30 dark:bg-white/40 hover:bg-white/60 dark:hover:bg-white/60 transition border border-white/30 dark:border-white/40 text-sm shadow-sm ${open ? 'ring-2 ring-brand-400' : ''}`}>
                <span aria-hidden>{open ? '×' : '☰'}</span>
              </button>
            </div>
          </div>
        </div>
        {/* Mobile panel */}
        <div className={`fixed top-12 right-3 z-40 w-60 rounded-2xl mobile-menu-panel shadow-lg p-4 flex flex-col gap-4 transition-transform origin-top-right ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'} bg-white text-slate-900 dark:bg-black dark:text-white`} role="menu" aria-label="Main menu">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-700/60">
            <span className="text-xs font-bold tracking-wide uppercase">Menu</span>
          </div>
          <nav className="flex flex-col gap-2" aria-label="Primary pages">
            {mobileMenuLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-3 w-full rounded-full text-[11px] font-semibold tracking-wide leading-none transition duration-150 px-3 py-2.5 justify-start mobile-menu-item bg-slate-100 hover:bg-white text-slate-900 shadow-sm border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-900 dark:text-white dark:border-zinc-700"
                onClick={() => {
                  if (link.event) {
                    trackAnalyticsEvent(link.event, { destination: link.href });
                  }
                  setOpen(false);
                }}
              >
                <span aria-hidden className="text-base leading-none">{link.icon}</span>
                <span className="flex-1 text-left">{link.label}</span>
              </Link>
            ))}
          </nav>
          <div className="md:hidden flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-zinc-700/60">
            {isSignedIn ? (
              <button
                onClick={() => { handleSignOut(); setOpen(false); }}
                className="inline-flex items-center gap-3 w-full rounded-full text-[11px] font-semibold tracking-wide leading-none transition duration-150 px-3 py-2.5 justify-start mobile-menu-item bg-slate-100 hover:bg-white text-slate-900 shadow-sm border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-900 dark:text-white dark:border-zinc-700"
              >
                <span aria-hidden className="text-base leading-none">👤</span>
                <span className="flex-1 text-left">{dictionary.ui?.signOut || "Sign out"}</span>
              </button>
            ) : (
              <Link 
                href={`/${locale}/guest?mode=signin`}
                className="inline-flex items-center gap-3 w-full rounded-full text-[11px] font-semibold tracking-wide leading-none transition duration-150 px-3 py-2.5 justify-start mobile-menu-item bg-slate-100 hover:bg-white text-slate-900 shadow-sm border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-900 dark:text-white dark:border-zinc-700"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden className="text-base leading-none">👤</span>
                <span className="flex-1 text-left">{dictionary.ui?.signIn || "Sign in"}</span>
              </Link>
            )}
            <LocaleSwitcher
              fullText={true}
              showGlobeIcon={true}
              className="inline-flex items-center gap-3 w-full rounded-full text-[11px] font-semibold tracking-wide leading-none transition duration-150 px-3 py-2.5 justify-start mobile-menu-item bg-slate-100 hover:bg-white text-slate-900 shadow-sm border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-900 dark:text-white dark:border-zinc-700"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
