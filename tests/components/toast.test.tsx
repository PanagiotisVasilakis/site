// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}));

import { ToastProvider, useToast } from '@/components/Toast';

function Consumer() {
  const { push } = useToast();
  return <button type="button" onClick={() => push('Saved')}>Show toast</button>;
}

function Tree() {
  return (
    <ToastProvider>
      <Consumer />
    </ToastProvider>
  );
}

function showToast() {
  fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses a toast after about five seconds (identity §8 Toast)', () => {
    render(<Tree />);

    showToast();
    advance(4800);
    expect(screen.queryByText('Saved')).toBeTruthy();
    advance(800);
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('dismisses a toast with the dismiss button', () => {
    render(<Tree />);

    showToast();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Saved')).toBeNull();
  });
});
