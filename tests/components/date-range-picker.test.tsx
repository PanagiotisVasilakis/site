// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
});
