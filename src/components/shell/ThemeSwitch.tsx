"use client";

import { useSyncExternalStore } from 'react';
import { Icon } from '@/components/icons/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented, segmentedItemClass } from '@/components/ui/Segmented';
import type { ShellDictionary } from '@/i18n/domains/shell';
import { logger } from '@/lib/logger-client';

/**
 * identity §5.2, §5.7, §8 ThemeSwitch. The DOM is the source of truth: `data-theme` on <html> is set only
 * for a stored choice (the boot script does the same on load); without it the CSS media query follows the
 * OS. "Auto" removes both the stored key and the attribute.
 */
type ThemeChoice = 'auto' | 'light' | 'dark';
type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : 'auto';
}

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

function getSnapshot(): string {
  const choice = readChoice();
  return `${choice}|${choice === 'auto' ? systemTheme() : choice}`;
}

function getServerSnapshot(): string {
  return 'auto|light';
}

function setDomChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia?.(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    const value = event.newValue;
    setDomChoice(event.key !== null && (value === 'light' || value === 'dark') ? value : 'auto');
    onChange();
  };
  media?.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function commitChoice(choice: ThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch (err) {
    logger.warn('ThemeSwitch could not store the theme', err instanceof Error ? err : { error: String(err) });
  }
  setDomChoice(choice);
  notify();
}

/**
 * Applies a choice. With `data-motion="full"` and the View Transition API, the new theme is revealed as a
 * circle growing from the centre of `origin` (§5.7, motion.css); otherwise the change is instant.
 */
function changeTheme(choice: ThemeChoice, origin: Element) {
  const root = document.documentElement;
  if (root.getAttribute('data-motion') !== 'full' || typeof document.startViewTransition !== 'function') {
    commitChoice(choice);
    return;
  }
  const rect = origin.getBoundingClientRect();
  root.style.setProperty('--vt-x', `${Math.round(rect.left + rect.width / 2)}px`);
  root.style.setProperty('--vt-y', `${Math.round(rect.top + rect.height / 2)}px`);
  root.setAttribute('data-vt', 'theme');
  const clear = () => root.removeAttribute('data-vt');
  document.startViewTransition(() => commitChoice(choice)).finished.then(clear, clear);
}

function useTheme(): { choice: ThemeChoice; theme: Theme } {
  const [choice, theme] = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).split('|');
  return { choice: choice as ThemeChoice, theme: theme as Theme };
}

type ThemeLabels = Pick<ShellDictionary, 'switchToNight' | 'switchToDay' | 'theme' | 'themeAuto' | 'themeDay' | 'themeNight'>;

/** Header IconButton: toggles between day and night (a stored choice). */
export function ThemeSwitch({ t, className }: { t: ThemeLabels; className?: string }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton
      label={dark ? t.switchToDay : t.switchToNight}
      className={className}
      onClick={(event) => changeTheme(dark ? 'light' : 'dark', event.currentTarget)}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={20} />
    </IconButton>
  );
}

/** Menu Segmented: Auto · Day · Night. */
export function ThemeSetting({ t, className }: { t: ThemeLabels; className?: string }) {
  const { choice } = useTheme();
  const options: Array<[ThemeChoice, string]> = [['auto', t.themeAuto], ['light', t.themeDay], ['dark', t.themeNight]];
  return (
    <Segmented label={t.theme} className={className}>
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={segmentedItemClass}
          aria-pressed={choice === value}
          onClick={(event) => changeTheme(value, event.currentTarget)}
        >
          {label}
        </button>
      ))}
    </Segmented>
  );
}
