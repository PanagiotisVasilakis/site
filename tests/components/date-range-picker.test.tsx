// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-day-picker/dist/style.css', () => ({}));

import DateRangePicker from '@/components/DateRangePicker';

describe('date range picker', () => {
  it('keeps the calendar mounted while the selection changes', () => {
    render(<DateRangePicker isOpen locale="en" />);

    const grid = screen.getByRole('grid');
    const enabledDay = Array.from(grid.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => !button.disabled);
    expect(enabledDay).toBeDefined();

    fireEvent.click(enabledDay!);

    // A component type recreated on every render would remount the calendar and detach this node.
    expect(grid.isConnected).toBe(true);
    expect(screen.getByRole('grid')).toBe(grid);
  });

  it('offers "Clear dates" below the calendar, clear of the month navigation', () => {
    const onChange = vi.fn();
    render(<DateRangePicker isOpen locale="en" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    const grid = screen.getByRole('grid');
    const day = Array.from(grid.querySelectorAll<HTMLButtonElement>('button')).find((button) => !button.disabled);
    fireEvent.click(day!);

    const clear = screen.getByRole('button', { name: 'Clear dates' });
    // Rendered after the calendar grid (in the footer), not in the caption row with "Next month".
    expect(grid.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(clear);
    expect(onChange).toHaveBeenLastCalledWith({ from: undefined, to: undefined });
    expect(screen.queryByRole('button', { name: 'Clear dates' })).toBeNull();
  });

  describe('one-night minimum', () => {
    afterEach(() => vi.useRealTimers());

    function enabledDaysInNextMonth(): HTMLButtonElement[] {
      fireEvent.click(screen.getByRole('button', { name: /next month/i }));
      return Array.from(screen.getByRole('grid').querySelectorAll<HTMLButtonElement>('button'))
        .filter((button) => !button.disabled);
    }

    it('selects only check-in on the first click and keeps the calendar open', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onChange = vi.fn();
      const onClose = vi.fn();
      render(<DateRangePicker isOpen locale="en" onChange={onChange} onClose={onClose} />);

      fireEvent.click(enabledDaysInNextMonth()[3]);
      act(() => { vi.advanceTimersByTime(1_000); });

      expect(onChange).toHaveBeenLastCalledWith({ from: expect.any(Date), to: undefined });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    });

    it('closes after a second, later day completes a stay of at least one night', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onChange = vi.fn();
      const onClose = vi.fn();
      render(<DateRangePicker isOpen locale="en" onChange={onChange} onClose={onClose} />);

      const days = enabledDaysInNextMonth();
      fireEvent.click(days[3]);
      fireEvent.click(days[5]);
      act(() => { vi.advanceTimersByTime(1_000); });

      const lastRange = onChange.mock.lastCall?.[0] as { from: Date; to: Date };
      expect(lastRange.to.getTime() - lastRange.from.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 3_600_000);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
