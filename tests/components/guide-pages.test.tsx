// @vitest-environment jsdom

import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/phones',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import CategoryPage from '@/app/[locale]/[category]/page';
import ItemPage from '@/app/[locale]/[category]/[slug]/page';
import FavoritesPage from '@/app/[locale]/favorites/page';
import { ToastProvider } from '@/components/Toast';
import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory } from '@/lib/data';

const wrap = (node: React.ReactNode) => render(<ToastProvider>{node}</ToastProvider>);

describe('important phones (identity §9.6)', () => {
  it('puts the 112 band first, with a "Call 112" tel: button', async () => {
    const { container } = wrap(await CategoryPage({ params: Promise.resolve({ locale: 'en', category: 'phones' }) }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Important phones');
    const sections = container.querySelectorAll('section');
    const band = sections[0];
    expect(band).toHaveTextContent('112, free from any phone, EU-wide');
    expect(within(band).getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
    // The SOS illustration is not used (§7.3).
    expect(container.querySelector('img[src*="sos-hero"]')).toBeNull();
  });

  it('links every phone number with tel: and gives every row a Call button', async () => {
    const { container } = wrap(await CategoryPage({ params: Promise.resolve({ locale: 'en', category: 'phones' }) }));

    const numbers = getItemsByCategory('phones')
      .flatMap((item) => [item.phone, ...(item.phones ?? [])])
      .filter((value): value is string => Boolean(value));
    for (const number of new Set(numbers)) {
      const links = [...container.querySelectorAll(`a[href="${telHref(number)}"]`)];
      expect(links.length, number).toBeGreaterThan(0);
    }
    // No phone number is printed outside a tel: link.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/(\+30[\d ]{6,}|^\s*112\s*$)/.test(node.textContent ?? '')) {
        expect(node.parentElement?.closest('a[href^="tel:"]'), node.textContent ?? '').not.toBeNull();
      }
    }
    for (const name of ['Kalamata Police Station', 'Kalamata Fire Department', 'General Hospital of Kalamata', 'Kalamata Radio Taxi']) {
      expect(screen.getByRole('link', { name: `Call ${name}` }).getAttribute('href')).toMatch(/^tel:\+30\d+$/);
    }
  });

  it('groups the rows under headings', async () => {
    wrap(await CategoryPage({ params: Promise.resolve({ locale: 'en', category: 'phones' }) }));

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '112, free from any phone, EU-wide',
      'Emergency services',
      'Health',
      'Getting around',
    ]);
  });
});

describe('guide detail (identity §9.5)', () => {
  it('shows the place with Directions and Save, and no booking call to action', async () => {
    const { container } = wrap(await ItemPage({
      params: Promise.resolve({ locale: 'en', category: 'moments', slug: 'kalamata-railway-park' }),
    }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kalamata Railway Park');
    expect(container).toHaveTextContent('1.5 km');
    // The first Directions link is the place's own (the More nearby cards follow).
    const directions = screen.getAllByRole('link', { name: /Directions/ })[0];
    expect(directions).toHaveAttribute('target', '_blank');
    expect(directions.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('button', { name: 'Save Kalamata Railway Park' })).toHaveAttribute('aria-pressed', 'false');
    for (const number of ['+30 27210 26464', '+30 27210 29909']) {
      expect(screen.getByRole('link', { name: number })).toHaveAttribute('href', telHref(number));
    }

    const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => /availability|airbnb/i.test(href))).toEqual([]);
    expect(container).not.toHaveTextContent(/airbnb|check dates|book/i);
  });

  it('lists three more places nearby, without the current one', async () => {
    wrap(await ItemPage({ params: Promise.resolve({ locale: 'en', category: 'moments', slug: 'kalamata-railway-park' }) }));

    const nearby = screen.getByRole('region', { name: 'More nearby' });
    const titles = within(nearby).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toHaveLength(3);
    expect(titles).not.toContain('Kalamata Railway Park');
  });
});

describe('favourites (identity §9.5)', () => {
  it('shows an EmptyPanel until a place is saved, then the saved GuideCard', async () => {
    wrap(await FavoritesPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Saved places');
    expect(screen.getByRole('heading', { name: 'No favourites yet.' })).toBeInTheDocument();
    expect(screen.getByText('Tap the heart on any place.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the guide' })).toHaveAttribute('href', '/en/moments');

    window.localStorage.setItem('favorites:v1', JSON.stringify(['moments:war-museum-kalamata']));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favorites:v1' })); });

    expect(screen.queryByRole('heading', { name: 'No favourites yet.' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'War Museum Kalamata Branch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save War Museum Kalamata Branch' })).toHaveAttribute('aria-pressed', 'true');
  });
});
