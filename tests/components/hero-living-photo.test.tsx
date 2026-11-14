// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HeroLivingPhoto from '@/components/home/hero/HeroLivingPhoto';

const listing = vi.hoisted(() => ({ bookingUrl: '' }));

vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get BOOKING_COM_LISTING_URL() {
    return listing.bookingUrl;
  },
}));

beforeEach(() => {
  listing.bookingUrl = '';
});

describe('HeroLivingPhoto (identity §9.1, §7.2, §1.4)', () => {
  it('renders the art-directed picture: AVIF then WebP per crop, the 3:2 WebP as the eager, high-priority LCP image', () => {
    const { container } = render(<HeroLivingPhoto locale="en" />);

    const sources = Array.from(container.querySelectorAll('picture > source'));
    expect(sources.map((source) => [source.getAttribute('media'), source.getAttribute('type')])).toEqual([
      ['(max-width: 639px)', 'image/avif'],
      ['(max-width: 639px)', 'image/webp'],
      ['(max-width: 1023px)', 'image/avif'],
      ['(max-width: 1023px)', 'image/webp'],
      [null, 'image/avif'],
      [null, 'image/webp'],
    ]);
    expect(sources[0].getAttribute('srcset')).toBe(
      '/house/balcony/hero/balcony-hero-9x16-480.avif 480w, /house/balcony/hero/balcony-hero-9x16-720.avif 721w',
    );
    const img = screen.getByRole('img', { name: /table for four/ });
    expect(img).toHaveClass('hero__img');
    expect(img).toHaveAttribute('src', '/house/balcony/hero/balcony-hero-3x2-1920.webp');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('has the Italian H1 in two lines and labels the section with it', () => {
    render(<HeroLivingPhoto locale="el" />);

    const h1 = screen.getByRole('heading', { level: 1, name: 'Dolce far niente' });
    expect(h1).toHaveAttribute('lang', 'it');
    expect(h1.querySelectorAll('.hero__line')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Dolce far niente' })).toHaveAttribute('data-hero');
  });

  it('links "Check dates" to the availability page and hides Booking.com without a listing link', () => {
    render(<HeroLivingPhoto locale="el" />);
    expect(document.querySelector('.hero__price')).toBeNull();
    expect(document.body).not.toHaveTextContent('€');

    const links = within(screen.getByRole('region')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/el/availability');
    expect(links[0]).toHaveTextContent('Δείτε ημερομηνίες');
    expect(screen.queryByText(/Booking\.com/)).toBeNull();
  });

  it('adds the glass Booking.com link for a valid link only', () => {
    listing.bookingUrl = 'https://example.com/Share-AiCapK';
    const invalid = render(<HeroLivingPhoto locale="en" />);
    expect(screen.queryByRole('link', { name: /Booking\.com/ })).toBeNull();
    expect(screen.queryByText(/Booking\.com/)).toBeNull();
    invalid.unmount();

    listing.bookingUrl = 'https://www.booking.com/Share-AiCapK';
    render(<HeroLivingPhoto locale="en" />);
    const bookingLink = screen.getByRole('link', { name: 'Book on Booking.com (opens in a new tab)' });
    expect(bookingLink).toHaveAttribute('href', 'https://www.booking.com/Share-AiCapK');
    expect(bookingLink).toHaveAttribute('target', '_blank');
    expect(bookingLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(bookingLink).toHaveClass('ui-btn--glass');
  });
});
