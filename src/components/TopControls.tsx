"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
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

  const refreshCheckIn = useCallback(async () => {
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
  }, []);

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

  // Hydrate visibility from server flag, fire analytics once on change
  useEffect(() => {
    if (checkInVisible !== !!showCheckIn) {
      setCheckInVisible(!!showCheckIn);
      setIsSignedIn(!!showCheckIn);
      const name = showCheckIn ? 'checkin_nav_shown' : 'checkin_nav_hidden';
      trackAnalyticsEvent(name, { reason: 'server_session', locale });
    }
  }, [showCheckIn, checkInVisible, locale, trackAnalyticsEvent]);

  // Update on page visibility/focus and periodically to reflect session changes
  useEffect(() => {
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
    // Periodic poll (lightweight) to catch silent expiry
    checkerRef.current = window.setInterval(refreshCheckIn, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      unsubscribe?.();
      if (checkerRef.current) window.clearInterval(checkerRef.current);
      inFlight.current?.abort();
    };
  }, [refreshCheckIn]);

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
            {/* Mobile menu trigger */}
            <div className="md:hidden flex items-center">
              <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={`h-7 w-7 rounded-full flex items-center justify-center bg-white/30 dark:bg-white/40 hover:bg-white/60 dark:hover:bg-white/60 transition border border-white/30 dark:border-white/40 text-sm shadow-sm ${open ? 'ring-2 ring-brand-400' : ''}`}>
                <span aria-hidden>{open ? '×' : '☰'}</span>
              </button>
            </div>
          </div>
        </div>
        {/* Mobile panel */}
        <div className={`md:hidden fixed top-12 right-3 z-40 w-56 rounded-xl border border-[color:var(--border-soft,#e5e7eb)] bg-white/90 backdrop-blur shadow-lg p-3 flex flex-col gap-3 transition-transform origin-top-right ${open ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'}`} role="menu" aria-label="Quick settings">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70 text-slate-800 dark:text-white">Quick Access</span>
            <ThemeToggle />
          </div>
          {isSignedIn ? (
            <button
              onClick={() => { handleSignOut(); setOpen(false); }}
              className={primaryNavButtonClasses}
            >
              <span aria-hidden className="text-sm leading-none">👤</span>
              {getDictionary(locale as Locale).ui?.signOut || "Sign out"}
            </button>
          ) : (
            <Link 
              href={`/${locale}/guest?mode=signin`}
              className={primaryNavButtonClasses}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden className="text-sm leading-none">👤</span>
              {getDictionary(locale as Locale).ui?.signIn || "Sign in"}
            </Link>
          )}
          <div className="h-8 rounded-full flex items-center px-2 bg-white/40 border border-white/30"><LocaleSwitcher /></div>
          {checkInVisible ? (
            <Link href={`/${locale}/check-in`} className="h-8 rounded-full flex items-center justify-center bg-white/40 border border-white/30 text-[11px] font-medium text-slate-800 dark:text-white"
              onClick={() => trackAnalyticsEvent('checkin_nav_clicked')}>
              Check‑in
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
