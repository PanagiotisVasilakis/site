// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}));

import { ToastProvider, useToast } from '@/components/Toast';

const consumerRendered = vi.fn();

function Consumer() {
  consumerRendered();
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

  it('does not re-render the provider on garbage-collection ticks with nothing to expire', () => {
    let providerCommits = 0;
    render(
      <Profiler id="toast" onRender={() => { providerCommits += 1; }}>
        <Tree />
      </Profiler>,
    );
    const initial = providerCommits;

    advance(400);
    advance(400);
    advance(400);

    expect(providerCommits).toBe(initial);
  });

  it('keeps the context value stable when a toast is pushed and expires', () => {
    render(<Tree />);
    const initial = consumerRendered.mock.calls.length;

    showToast();
    expect(screen.getByText('Saved')).toBeTruthy();
    advance(5600);
    expect(screen.queryByText('Saved')).toBeNull();

    expect(consumerRendered).toHaveBeenCalledTimes(initial);
  });

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
