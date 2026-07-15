import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterDrawer from './FilterDrawer';

describe('FilterDrawer modal contract', () => {
  afterEach(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('portals the open drawer, traps focus, and restores the background exactly', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container, rerender } = render(
      <>
        <button type="button">Open filters</button>
        <FilterDrawer open={false} onClose={onClose} title="Filters">
          <button type="button">Reset filters</button>
        </FilterDrawer>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open filters' });
    trigger.focus();
    container.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'clip';
    document.body.style.overflow = 'auto';

    rerender(
      <>
        <button type="button">Open filters</button>
        <FilterDrawer open onClose={onClose} title="Filters">
          <button type="button">Reset filters</button>
        </FilterDrawer>
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(dialog.parentElement).toHaveAttribute('data-filter-drawer-portal');
    await waitFor(() => {
      expect(container).toHaveAttribute('aria-hidden', 'true');
      expect(container).toHaveAttribute('inert');
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close filters' }));
    });

    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <>
        <button type="button">Open filters</button>
        <FilterDrawer open={false} onClose={onClose} title="Filters">
          <button type="button">Reset filters</button>
        </FilterDrawer>
      </>,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(container).toHaveAttribute('aria-hidden', 'false');
    expect(container).not.toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger);
  });

  it('does not leave hidden focusable controls in the document when closed', () => {
    render(
      <FilterDrawer open={false} onClose={vi.fn()}>
        <button type="button">Hidden action</button>
      </FilterDrawer>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hidden action' })).not.toBeInTheDocument();
  });
});
