// @vitest-environment jsdom

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeSetting, ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { getDictionary } from '@/i18n/dictionaries';

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<MediaListener>();
  const mediaQuery = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
    addListener: (listener: MediaListener) => listeners.add(listener),
    removeListener: (listener: MediaListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;
  vi.stubGlobal('matchMedia', () => mediaQuery);
  return {
    setMatches(value: boolean) {
      matches = value;
      const event = { matches: value, media: mediaQuery.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

const en = getDictionary('en').shell;
const el = getDictionary('el').shell;
const root = document.documentElement;

function installViewTransition() {
  const startViewTransition = vi.fn((update: () => void) => {
    update();
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition });
  return startViewTransition;
}

describe('ThemeSwitch (header toggle)', () => {
  beforeEach(() => {
    installMatchMedia(false);
    root.removeAttribute('data-theme');
    root.removeAttribute('data-motion');
    root.removeAttribute('data-vt');
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('derives the effective theme from the OS when data-theme is absent', async () => {
    installMatchMedia(true);
    render(<ThemeSwitch t={en} />);
    expect(await screen.findByRole('button', { name: 'Switch to day' })).toBeInTheDocument();
    expect(root).not.toHaveAttribute('data-theme');
  });

  it('shows the day action for a persisted dark choice', async () => {
    localStorage.setItem('theme', 'dark');
    root.setAttribute('data-theme', 'dark'); // as the boot script does
    render(<ThemeSwitch t={en} />);
    expect(await screen.findByRole('button', { name: 'Switch to day' })).toBeInTheDocument();
    expect(root).toHaveAttribute('data-theme', 'dark');
  });

  it('prefers data-theme set by the boot script over the OS preference', async () => {
    installMatchMedia(true);
    root.setAttribute('data-theme', 'light');
    render(<ThemeSwitch t={en} />);
    expect(await screen.findByRole('button', { name: 'Switch to night' })).toBeInTheDocument();
  });

  it('stores an explicit choice and sets data-theme', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch t={el} />);
    await user.click(await screen.findByRole('button', { name: 'Αλλαγή σε νυχτερινό' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Αλλαγή σε ημερήσιο' })).toBeInTheDocument();
  });

  it('follows OS changes while no choice is stored', async () => {
    const media = installMatchMedia(false);
    render(<ThemeSwitch t={en} />);
    await screen.findByRole('button', { name: 'Switch to night' });
    act(() => media.setMatches(true));
    expect(await screen.findByRole('button', { name: 'Switch to day' })).toBeInTheDocument();
    expect(root).not.toHaveAttribute('data-theme');
  });

  it('applies another tab\'s stored choice and its removal', async () => {
    render(<ThemeSwitch t={en} />);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' })));
    await waitFor(() => expect(root).toHaveAttribute('data-theme', 'dark'));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: null })));
    await waitFor(() => expect(root).not.toHaveAttribute('data-theme'));
    expect(await screen.findByRole('button', { name: 'Switch to night' })).toBeInTheDocument();
  });

  it('runs the circular view transition from the switch when motion is full', async () => {
    const start = installViewTransition();
    root.setAttribute('data-motion', 'full');
    const user = userEvent.setup();
    render(<ThemeSwitch t={en} />);
    await user.click(await screen.findByRole('button', { name: 'Switch to night' }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.style.getPropertyValue('--vt-x')).toMatch(/px$/);
    await waitFor(() => expect(root).not.toHaveAttribute('data-vt'));
  });

  it.each([['reduce'], [null]])('skips the view transition when data-motion is %s', async (motion) => {
    const start = installViewTransition();
    if (motion) root.setAttribute('data-motion', motion);
    const user = userEvent.setup();
    render(<ThemeSwitch t={en} />);
    await user.click(await screen.findByRole('button', { name: 'Switch to night' }));
    expect(start).not.toHaveBeenCalled();
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root).not.toHaveAttribute('data-vt');
  });

  it('switches instantly when the View Transition API is missing', async () => {
    root.setAttribute('data-motion', 'full');
    const user = userEvent.setup();
    render(<ThemeSwitch t={en} />);
    await user.click(await screen.findByRole('button', { name: 'Switch to night' }));
    expect(root).toHaveAttribute('data-theme', 'dark');
  });
});

describe('ThemeSetting (menu Auto / Day / Night)', () => {
  beforeEach(() => {
    installMatchMedia(true);
    root.removeAttribute('data-theme');
    root.removeAttribute('data-motion');
  });

  it('sets and removes data-theme and the stored key', async () => {
    const user = userEvent.setup();
    render(<ThemeSetting t={en} />);
    const group = screen.getByRole('group', { name: 'Theme' });
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true'));

    await user.click(within(group).getByRole('button', { name: 'Day' }));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(within(group).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(group).getByRole('button', { name: 'Night' }));
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(within(group).getByRole('button', { name: 'Auto' }));
    expect(root).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(within(group).getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the header toggle and the menu setting in sync', async () => {
    const user = userEvent.setup();
    render(<><ThemeSwitch t={en} /><ThemeSetting t={en} /></>);
    await user.click(await screen.findByRole('button', { name: 'Switch to day' }));
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Auto' }));
    expect(await screen.findByRole('button', { name: 'Switch to day' })).toBeInTheDocument();
  });

  it('keeps working when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const user = userEvent.setup();
    render(<ThemeSetting t={en} />);
    await user.click(screen.getByRole('button', { name: 'Night' }));
    expect(root).toHaveAttribute('data-theme', 'dark');
  });
});
