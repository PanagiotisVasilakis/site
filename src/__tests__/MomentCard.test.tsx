import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MomentCard } from '@/components/moments/MomentCard';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/favorites', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggle: vi.fn(),
  }),
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({
    push: vi.fn(),
  }),
}));

describe('MomentCard', () => {
  it('flips phone cards in place instead of linking to a dedicated details page', async () => {
    const user = userEvent.setup();

    render(
      <MomentCard
        id="police"
        slug="kalamata-police-station"
        name="Kalamata Police Station"
        summary="Police department and passport office"
        description="Local police and passport services."
        phone="+30 27210 91995"
        address="Iroon Polytechniou, Kalamata"
        categorySlug="phones"
        locale="en"
        labels={{
          viewDetails: 'View details',
          back: 'Back',
          call: 'Call',
          directions: 'Directions',
          website: 'Website',
        }}
      />
    );

    expect(screen.queryByRole('link', { name: /view details/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view details/i }));

    const back = screen.getByRole('button', { name: /back/i });
    expect(back).toBeInTheDocument();
    expect(back).toHaveFocus();
    expect(screen.getByRole('button', { name: /view details/i, hidden: true })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('link', { name: '+30 27210 91995' })).toHaveAttribute('href', 'tel:+302721091995');
    expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute('href', 'tel:+302721091995');

    await user.click(back);
    expect(screen.getByRole('button', { name: /view details/i })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });

  it('keeps dedicated detail links for non-phone cards', () => {
    render(
      <MomentCard
        id="museum"
        slug="archaeological-museum"
        name="Archaeological Museum"
        summary="Artifacts and exhibits"
        categorySlug="moments"
        locale="en"
        labels={{
          viewDetails: 'View details',
          back: 'Back',
          call: 'Call',
          directions: 'Directions',
          website: 'Website',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/en/moments/archaeological-museum');
    expect(screen.getByRole('link', { name: /view details for archaeological museum/i })).toHaveAttribute('href', '/en/moments/archaeological-museum');
  });
});
