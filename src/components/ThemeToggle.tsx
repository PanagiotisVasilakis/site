"use client";
import { useEffect, useState } from "react";

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
    } catch {}
  }, []);
  // Apply theme side effects
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('theme', theme); } catch {}
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
  className="theme-toggle"
    >
      <span aria-hidden suppressHydrationWarning>{icon}</span>
    </button>
  );
}
