"use client";
import { useEffect, useState } from "react";
import { logger } from '@/lib/logger-client';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">('light');
  const [mounted, setMounted] = useState(false);
  // On mount, resolve real theme (stored > system preference)
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      }
    } catch (err) { logger.warn('ThemeToggle read localStorage failed', err instanceof Error ? err : { error: String(err) }); }
  }, []);
  // Apply theme side effects
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.removeAttribute('data-theme');
      root.classList.remove('dark');
    }
    try { localStorage.setItem('theme', theme); } catch (err) { logger.warn('ThemeToggle write localStorage failed', err instanceof Error ? err : { error: String(err) }); }
  }, [theme, mounted]);
  // Listen to system changes only if user hasn't chosen explicitly
  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return; // user preference locks
    const listener = () => setTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [mounted]);
  const icon = mounted ? (theme === 'dark' ? '🌞' : '🌙') : '🌙';
  const label = mounted ? (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle color scheme';
  return (
    <button
      type="button"
      aria-label={label}
      suppressHydrationWarning
      onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      className="w-12 h-11 md:h-9 inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70 white-in-dark transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 dark:focus-visible:ring-brand-400/50"
    >
      <span aria-hidden suppressHydrationWarning className="select-none text-sm">{icon}</span>
    </button>
  );
}
