import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApartmentGalleryLightbox from './ApartmentGalleryLightbox';

vi.mock('next/image', () => ({
  default: ({ fill, priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    void fill;
    void priority;
    return <img alt={props.alt ?? ''} {...props} />;
  },
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function MotionDiv(
      { children, ...props },
      ref,
    ) {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => ![
          'initial', 'animate', 'exit', 'transition', 'variants', 'custom', 'drag',
          'dragConstraints', 'dragElastic', 'onDragEnd',
        ].includes(key)),
      );
      return <div ref={ref} {...domProps}>{children}</div>;
    }),
  },
}));

const photos = [
  { src: '/one.jpg', altKey: 'living' as const },
  { src: '/two.jpg', altKey: 'kitchen' as const },
];

describe('ApartmentGalleryLightbox modal contract', () => {
  afterEach(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('isolates the page, traps focus, labels thumbnails, and restores state on close', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <button type="button">Open gallery</button>
        <ApartmentGalleryLightbox
          photos={photos}
          alts={{ living: 'Living room', kitchen: 'Kitchen' }}
          enableHaptics={false}
        />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open gallery' });
    trigger.focus();
    container.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'clip';
    document.body.style.overflow = 'auto';

    act(() => {
      window.dispatchEvent(new CustomEvent('open-apartment-lightbox', { detail: { startIndex: 0 } }));
    });

    const dialog = await screen.findByRole('dialog', { name: 'Photo viewer' });
    const close = within(dialog).getByRole('button', { name: 'Close viewer' });
    await waitFor(() => {
      expect(document.activeElement).toBe(close);
      expect(container).toHaveAttribute('aria-hidden', 'true');
      expect(container).toHaveAttribute('inert');
    });

    const firstThumbnail = within(dialog).getByRole('button', { name: 'View image 1 of 2' });
    const secondThumbnail = within(dialog).getByRole('button', { name: 'View image 2 of 2' });
    expect(firstThumbnail).toHaveAttribute('aria-current', 'true');
    expect(secondThumbnail).not.toHaveAttribute('aria-current');

    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(container).toHaveAttribute('aria-hidden', 'false');
    expect(container).not.toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger);
  });
});
