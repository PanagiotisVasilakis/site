import { act, render, screen } from '@testing-library/react';
import DateRangePicker from './DateRangePicker';

vi.mock('react-day-picker', () => ({
  DayPicker: () => <div>Calendar grid</div>,
}));
vi.mock('@/lib/logger-client', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));

describe('DateRangePicker popover semantics', () => {
  it('focuses its controls, closes on Escape, and restores the trigger', async () => {
    const onClose = vi.fn();
    const view = render(
      <>
        <button type="button">Choose dates</button>
        <DateRangePicker isOpen={false} onClose={onClose} />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Choose dates' });
    trigger.focus();

    view.rerender(
      <>
        <button type="button">Choose dates</button>
        <DateRangePicker isOpen onClose={onClose} />
      </>,
    );
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const dialog = screen.getByRole('dialog', { name: 'Date range picker' });
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<button type="button">Choose dates</button>);
    expect(screen.getByRole('button', { name: 'Choose dates' })).toHaveFocus();
  });
});
