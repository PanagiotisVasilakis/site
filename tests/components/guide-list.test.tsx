// @vitest-environment jsdom

import type React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ map: [] as string[], leaflet: [] as string[] }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/moments',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/components/ApartmentLocationMap', () => {
  loads.map.push('ApartmentLocationMap');
  return { default: () => <div data-testid="guide-map" /> };
});
vi.mock('leaflet', () => {
  loads.leaflet.push('leaflet');
  return { default: {} };
});

import CategoryPage from '@/app/[locale]/[category]/page';
import ItemPage from '@/app/[locale]/[category]/[slug]/page';
import FavoritesPage from '@/app/[locale]/favorites/page';
import { ToastProvider } from '@/components/Toast';
import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory } from '@/lib/data';

const wrap = (node: React.ReactNode) => render(<ToastProvider>{node}</ToastProvider>);

async function renderGuide(locale = 'en') {
  return wrap(await CategoryPage({ params: Promise.resolve({ locale, category: 'moments' }) }));
}

const cardTitles = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

describe('guide list (identity §9.5, R3-V8)', () => {
  it('defers loading Leaflet/map until Map is clicked and filters unmapped places by active chip', async () => {
    try {
      await renderGuide();
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(18);
      await vi.dynamicImportSettled();
      expect(loads.map).toEqual([]);
      expect(loads.leaflet).toEqual([]);

      const mapButton = screen.getByRole('button', { name: 'Map' });
      expect(mapButton).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(mapButton);

      expect(await screen.findByTestId('guide-map')).toBeInTheDocument();
      expect(mapButton).toHaveAttribute('aria-pressed', 'true');
      expect(loads.map).toEqual(['ApartmentLocationMap']);

      const links = (name: string) => within(screen.getByRole('list', { name })).getAllByRole('link').map((l) => l.textContent);
      expect(screen.getByText('18 places')).toHaveAttribute('role', 'status');
      expect(links('Places on the map').length + links('Not on the map').length).toBe(18);

      fireEvent.click(screen.getByRole('button', { name: 'Beaches 2' }));
      expect(screen.getByText('2 places')).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('list', { name: 'Places on the map' })).toBeNull();
      expect(links('Not on the map')).toEqual(['Kalamata City Beach (Navarinou Avenue)', 'Gialova Lagoon and Voidokilia Beach']);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('shows populated category chips, sorts by distance, and supports ?q=, search/Escape, and Clear filters', async () => {
    window.history.replaceState(null, '', '/en/moments?q=war');
    try {
      const qRender = await renderGuide();
      expect(screen.getByRole('searchbox', { name: 'Search the guide' })).toHaveValue('war');
      expect(screen.getByText('1 place')).toBeInTheDocument();
      qRender.unmount();
    } finally {
      window.history.replaceState(null, '', '/');
    }

    await renderGuide();
    const chips = within(screen.getByRole('group', { name: 'Filter by category' })).getAllByRole('button');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Bars|Brunch|Nearby/ })).toBeNull();

    expect(cardTitles().slice(0, 2)).toEqual(['Viktoria Karelia Greek Costumes Collection', 'Kalamata Railway Park']);
    expect(screen.getByRole('heading', { level: 2, name: 'Kalamata Railway Park' }).closest('article')).toHaveTextContent('1.5 km');

    const search = screen.getByRole('searchbox', { name: 'Search the guide' });
    fireEvent.change(search, { target: { value: 'locomotives' } });
    expect(cardTitles()).toEqual(['Kalamata Railway Park']);

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(cardTitles()).toHaveLength(18);

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByRole('heading', { name: 'No places match' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toHaveLength(18);
  });

  it('persists saved favourites, updates the header link, and filters stale ids from storage', async () => {
    await renderGuide();
    const save = screen.getByRole('button', { name: 'Save Kalamata Railway Park' });
    expect(save).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('favorites:v1') ?? '[]')).toEqual(['moments:railway-park-kalamata']);
    expect(screen.getByRole('link', { name: /Saved/ })).toHaveAttribute('href', '/en/favorites');
    expect(screen.getByRole('link', { name: /Saved/ })).toHaveTextContent('1');

    fireEvent.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem('favorites:v1') ?? '[]')).toEqual([]);

    window.localStorage.setItem('favorites:v1', JSON.stringify(['sightseeing:removed-place', 'moments:railway-park-kalamata']));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favorites:v1' })); });
    expect(screen.getByRole('link', { name: 'Saved places: 1' })).toHaveTextContent('1');
  });
});

describe('phones, detail, and favourites pages', () => {
  it('renders 112 first and wraps every phone number in a tel: link on /phones', async () => {
    const { container } = wrap(await CategoryPage({ params: Promise.resolve({ locale: 'en', category: 'phones' }) }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Important phones');
    expect(within(container.querySelector('section')!).getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
    const numbers = getItemsByCategory('phones').flatMap((i) => [i.phone, ...(i.phones ?? [])]).filter((v): v is string => Boolean(v));
    for (const number of new Set(numbers)) {
      expect(container.querySelectorAll(`a[href="${telHref(number)}"]`).length, number).toBeGreaterThan(0);
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/(\+30[\d ]{6,}|^\s*112\s*$)/.test(node.textContent ?? '')) {
        expect(node.parentElement?.closest('a[href^="tel:"]'), node.textContent ?? '').not.toBeNull();
      }
    }
  });

  it('renders guide detail without booking links and lists nearby places', async () => {
    const { container } = wrap(await ItemPage({ params: Promise.resolve({ locale: 'en', category: 'moments', slug: 'kalamata-railway-park' }) }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kalamata Railway Park');
    expect(screen.getAllByRole('link', { name: /Directions/ })[0]).toHaveAttribute('target', '_blank');
    expect([...container.querySelectorAll('a')].filter((l) => /availability|booking\.com/i.test(l.getAttribute('href') ?? ''))).toEqual([]);
    const nearby = screen.getByRole('region', { name: 'More nearby' });
    const titles = within(nearby).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toHaveLength(3);
    expect(titles).not.toContain('Kalamata Railway Park');
  });

  it('shows EmptyPanel until a place is saved, then renders the saved card on storage update', async () => {
    window.localStorage.removeItem('favorites:v1');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favorites:v1' })); });
    wrap(await FavoritesPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByRole('heading', { name: 'No favourites yet.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the guide' })).toHaveAttribute('href', '/en/moments');

    window.localStorage.setItem('favorites:v1', JSON.stringify(['moments:war-museum-kalamata']));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favorites:v1' })); });

    expect(screen.queryByRole('heading', { name: 'No favourites yet.' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'War Museum Kalamata Branch' })).toBeInTheDocument();
  });
});
