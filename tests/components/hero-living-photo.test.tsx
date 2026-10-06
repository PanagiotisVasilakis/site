// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HeroLivingPhoto from '@/components/home/hero/HeroLivingPhoto';

const listing = vi.hoisted(() => ({ url: '' }));

vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get AIRBNB_LISTING_URL() {
    return listing.url;
  },
}));

beforeEach(() => {
  listing.url = '';
});

describe('HeroLivingPhoto (identity §9.1, §7.2, §1.4)', () => {
  it('renders the art-directed picture: AVIF then WebP per crop, the 3:2 WebP as the eager, high-priority LCP image', () => {
    const { container } = render(<HeroLivingPhoto locale="en" fromPriceCents={8500} />);

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
    render(<HeroLivingPhoto locale="el" fromPriceCents={null} />);

    const h1 = screen.getByRole('heading', { level: 1, name: 'Dolce far niente' });
    expect(h1).toHaveAttribute('lang', 'it');
    expect(h1.querySelectorAll('.hero__line')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Dolce far niente' })).toHaveAttribute('data-hero');
  });

  it('shows "from €X / night" from the availability price', () => {
    const { container } = render(<HeroLivingPhoto locale="en" fromPriceCents={8500} />);

    expect(container.querySelector('.hero__price')).toHaveTextContent('from €85 / night');
    expect(container.querySelector('.hero__price-value')).toHaveTextContent('€85');
  });

  it('formats the Greek price line', () => {
    const { container } = render(<HeroLivingPhoto locale="el" fromPriceCents={8500} />);

    expect(container.querySelector('.hero__price')?.textContent?.replace(/\s/g, ' ')).toBe('από 85 € / νύχτα');
  });

  it('shows no number without a price', () => {
    const { container } = render(<HeroLivingPhoto locale="en" fromPriceCents={null} />);

    expect(container.querySelector('.hero__price')).toHaveTextContent('See prices & free dates');
    expect(container.querySelector('.hero__price')?.textContent).not.toMatch(/\d|€/);
  });

  it('links "Check dates" to the availability page and hides Airbnb without a listing URL', () => {
    render(<HeroLivingPhoto locale="el" fromPriceCents={null} />);

    const links = within(screen.getByRole('region')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/el/availability');
    expect(links[0]).toHaveTextContent('Δείτε ημερομηνίες');
  });

  it('adds the glass "Book on Airbnb" link for a valid listing URL only', () => {
    listing.url = 'https://www.airbnb.com/rooms/123';
    const { unmount } = render(<HeroLivingPhoto locale="en" fromPriceCents={null} />);

    const airbnb = screen.getByRole('link', { name: 'Book on Airbnb (opens in a new tab)' });
    expect(airbnb).toHaveAttribute('href', 'https://www.airbnb.com/rooms/123');
    expect(airbnb).toHaveAttribute('target', '_blank');
    expect(airbnb).toHaveAttribute('rel', 'noopener noreferrer');
    expect(airbnb).toHaveClass('ui-btn--glass');
    unmount();

    listing.url = 'https://example.com/rooms/123';
    render(<HeroLivingPhoto locale="en" fromPriceCents={null} />);
    expect(screen.queryByRole('link', { name: /Airbnb/ })).toBeNull();
  });

  it('keeps the scroll hint out of the accessibility tree', () => {
    const { container } = render(<HeroLivingPhoto locale="en" fromPriceCents={null} />);

    expect(container.querySelector('.hero__hint')).toHaveAttribute('aria-hidden', 'true');
  });
});
