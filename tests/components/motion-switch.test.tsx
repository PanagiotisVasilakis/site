// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MotionSwitch } from '@/components/shell/MotionSwitch';
import { getDictionary } from '@/i18n/dictionaries';

type Listener = () => void;

// OS preference: `reduce` true means prefers-reduced-motion: reduce.
function installReducedMotion(initialReduce: boolean) {
  let reduce = initialReduce;
  const listeners = new Set<Listener>();
  vi.stubGlobal('matchMedia', (media: string) => ({
    get matches() {
      if (media.includes('no-preference')) return !reduce;
      if (media.includes('reduce')) return reduce;
      return false;
    },
    media,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  }) as unknown as MediaQueryList);
  return {
    setReduce(value: boolean) {
      reduce = value;
      listeners.forEach((listener) => listener());
    },
  };
}

const en = getDictionary('en').shell;
const el = getDictionary('el').shell;
const root = document.documentElement;

describe('MotionSwitch', () => {
  beforeEach(() => {
    root.setAttribute('data-motion', 'full');
  });

  it('stores "reduce", drives data-motion and shows the pressed label', async () => {
    installReducedMotion(false);
    const user = userEvent.setup();
    render(<MotionSwitch t={en} />);
    const button = screen.getByRole('button', { name: 'Reduce motion' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(localStorage.getItem('motion')).toBe('reduce');
    expect(root).toHaveAttribute('data-motion', 'reduce');
    expect(screen.getByRole('button', { name: 'Allow motion' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Allow motion' }));
    expect(localStorage.getItem('motion')).toBeNull();
    expect(root).toHaveAttribute('data-motion', 'full');
    expect(screen.getByRole('button', { name: 'Reduce motion' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is disabled with the device note when the OS reduces motion', async () => {
    installReducedMotion(true);
    root.removeAttribute('data-motion');
    render(<MotionSwitch t={el} />);
    const button = await screen.findByRole('button', { name: 'Λιγότερη κίνηση' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleDescription('Μειωμένη από τις ρυθμίσεις της συσκευής σας');
  });

  it('follows a live OS change', async () => {
    const os = installReducedMotion(false);
    render(<MotionSwitch t={en} />);
    const button = screen.getByRole('button', { name: 'Reduce motion' });
    expect(button).toBeEnabled();
    act(() => os.setReduce(true));
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByText('Reduced by your device settings')).toBeInTheDocument();
  });

  it('reflects a stored choice from another tab', async () => {
    installReducedMotion(false);
    render(<MotionSwitch t={en} />);
    localStorage.setItem('motion', 'reduce');
    act(() => {
      root.setAttribute('data-motion', 'reduce');
      window.dispatchEvent(new StorageEvent('storage', { key: 'motion', newValue: 'reduce' }));
    });
    expect(await screen.findByRole('button', { name: 'Allow motion' })).toHaveAttribute('aria-pressed', 'true');
  });
});
