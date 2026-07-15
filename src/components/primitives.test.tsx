import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimpleChevronDown, SimpleChevronUp } from '@/components/icons/Chevrons';
import { Skeleton } from '@/components/Skeleton';
import { CTAButton } from '@/components/CTAButton';

describe('shared visual primitives', () => {
  it('renders both chevron directions', () => {
    const { container } = render(
      <div>
        <SimpleChevronDown className="down" />
        <SimpleChevronUp className="up" />
      </div>,
    );

    expect(container.querySelector('svg.down path')).toHaveAttribute('d', 'M19 9l-7 7-7-7');
    expect(container.querySelector('svg.up path')).toHaveAttribute('d', 'M5 15l7-7 7 7');
  });

  it('renders a theme-aware, decorative skeleton', () => {
    const { container } = render(<Skeleton className="h-8" />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveClass('h-8', 'bg-[color:var(--layer-surface-alt)]');
  });

  it('forwards asChild attributes, events, and merged classes', async () => {
    const onClick = vi.fn();
    render(
      <CTAButton
        asChild
        variant="primary"
        className="wrapper-class"
        aria-label="Open directions for the apartment"
        data-tracking="directions"
        onClick={onClick}
      >
        <a href="#directions" className="child-class">Directions</a>
      </CTAButton>,
    );

    const link = screen.getByRole('link', { name: 'Open directions for the apartment' });
    expect(link).toHaveAttribute('data-tracking', 'directions');
    expect(link).toHaveClass('focus:outline-none', 'btn-primary', 'child-class', 'wrapper-class');
    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
