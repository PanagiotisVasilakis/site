// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/en' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

import DocumentLocale from '@/components/DocumentLocale';
import FilterDrawer from '@/components/FilterDrawer';
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
    render(<ThemeToggle showText />);
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

describe('filter drawer accessibility contract', () => {
  it('renders nothing while closed', () => {
    render(<FilterDrawer open={false} onClose={vi.fn()}>Filters</FilterDrawer>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a modal, hides background siblings and locks page scroll', async () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <FilterDrawer open onClose={onClose} title="Choose filters">
        <button type="button">First option</button>
      </FilterDrawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Choose filters' })).toHaveAttribute('aria-modal', 'true');
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('hidden');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close filters' })).toHaveFocus());
    unmount();
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(container).not.toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes on Escape, close button, done button and backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <FilterDrawer open onClose={onClose} closeLabel="Close choices" doneLabel="Apply choices">
        <span>Contents</span>
      </FilterDrawer>,
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close choices' }));
    await user.click(screen.getByRole('button', { name: 'Apply choices' }));
    const portal = document.querySelector('[data-filter-drawer-portal]');
    const backdrop = portal?.firstElementChild;
    expect(backdrop).toBeInstanceOf(HTMLElement);
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(container).toBeEmptyDOMElement();
  });

  it('traps forward and reverse tab focus inside the dialog', () => {
    render(
      <FilterDrawer open onClose={vi.fn()}>
        <button type="button">Middle action</button>
      </FilterDrawer>,
    );
    const buttons = screen.getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});
