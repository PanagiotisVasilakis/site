// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/en' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

import DocumentLocale from '@/components/DocumentLocale';
import ThemeToggle from '@/components/ThemeToggle';

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
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

describe('theme and document locale behavior', () => {
  beforeEach(() => {
    navigation.pathname = '/en';
    installMatchMedia(false);
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('applies a persisted dark theme and exposes the correct action label', async () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    const button = await screen.findByRole('button', { name: /switch to light mode/i });
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(button).toHaveTextContent('Dark');
  });

  it('persists an explicit user choice and updates document state', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = await screen.findByRole('button', { name: /switch to dark mode/i });
    await user.click(button);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(button).toHaveAccessibleName(/switch to light mode/i);
  });

  it('follows system changes until the user makes an explicit choice', async () => {
    const media = installMatchMedia(false);
    render(<ThemeToggle />);
    await screen.findByRole('button', { name: /switch to dark mode/i });
    act(() => media.setMatches(true));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('responds to cross-tab storage changes and uses Greek labels', async () => {
    navigation.pathname = '/el/about';
    render(<ThemeToggle />);
    await screen.findByRole('button', { name: /σκοτεινή/i });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' })));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('keeps the document language synchronized on rerender', () => {
    const { rerender } = render(<DocumentLocale locale="en" />);
    expect(document.documentElement.lang).toBe('en');
    rerender(<DocumentLocale locale="el" />);
    expect(document.documentElement.lang).toBe('el');
  });
});
