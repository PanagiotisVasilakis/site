import { render } from '@testing-library/react';
import { SimpleChevronDown, SimpleChevronUp } from '@/components/icons/Chevrons';
import { Skeleton } from '@/components/Skeleton';

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
});
