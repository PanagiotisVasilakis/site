// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/moments',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/components/ApartmentLocationMap', () => ({ default: () => <div data-testid="guide-map" /> }));

import CategoryPage from '@/app/[locale]/[category]/page';
import { ToastProvider } from '@/components/Toast';

async function renderGuide(locale = 'en') {
  return render(
    <ToastProvider>{await CategoryPage({ params: Promise.resolve({ locale, category: 'moments' }) })}</ToastProvider>,
  );
}

const cardTitles = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

describe('guide list (identity §9.5, R3-V8)', () => {
  it('renders category chips only for categories with content, each with its count', async () => {
    await renderGuide();

    const chips = within(screen.getByRole('group', { name: 'Filter by category' })).getAllByRole('button');
    // R3-C2 content: bars, brunch and nearby have no content, so their chips stay hidden (R-325/R-326 decision).
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'All 18', 'Beaches 2', 'Museums 6', 'Restaurants 3', 'Taygetos 1', 'Sites 9',
    ]);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Bars|Brunch|Nearby/ })).toBeNull();
  });

  it('sorts the cards by straight-line distance from the apartment and shows it', async () => {
    await renderGuide();

    expect(cardTitles()).toEqual([
      'Viktoria Karelia Greek Costumes Collection',
      'Kalamata Railway Park',
      'Historical and Folklore Museum of Kalamata',
      'Archaeological Museum of Messenia (Benakeion)',
      'War Museum Kalamata Branch',
      // Places without coordinates follow, in content order, without a distance.
      'Kalamata City Beach (Navarinou Avenue)',
      'Kalamata Central Market',
      'Kalamata Olives and Messinian Olive Oil',
      'Lalagia',
      'Kalamata Castle and Old Town',
      'Ancient Messene',
      'Polylimnio, Messenia',
      'Niokastro (Pylos Castle)',
      'Methoni Castle',
      'Koroni Castle',
      'Gialova Lagoon and Voidokilia Beach',
      'Palace of Nestor',
      'Mount Taygetos',
    ]);
    const railway = screen.getByRole('heading', { level: 2, name: 'Kalamata Railway Park' }).closest('article')!;
    expect(railway).toHaveTextContent('1.5 km');
  });

  it('keeps the heading order without a skipped level (R-360: h1, then the card titles)', async () => {
    const { container } = await renderGuide();

    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => Number(heading.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((level, index) => expect(level, `heading ${index + 2}`).toBeLessThanOrEqual(levels[index] + 1));
  });

  it('applies the ?q= search submitted from the stay hub guide tile (identity §9.4)', async () => {
    window.history.replaceState(null, '', '/en/moments?q=war');
    try {
      await renderGuide();

      expect(screen.getByRole('searchbox', { name: 'Search the guide' })).toHaveValue('war');
      expect(screen.getByText('1 place')).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('announces the result count in a polite live region', async () => {
    await renderGuide();

    const count = screen.getByText('18 places');
    expect(count).toHaveAttribute('role', 'status');
    expect(count).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: 'Sites 9' }));
    expect(count).toHaveTextContent('9 places');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the guide' }), { target: { value: 'war' } });
    expect(count).toHaveTextContent('1 place');
  });

  it('filters by search and clears the search with Escape', async () => {
    await renderGuide();
    const search = screen.getByRole('searchbox', { name: 'Search the guide' });
    expect(search).toHaveAttribute('type', 'search');

    fireEvent.change(search, { target: { value: 'locomotives' } });
    expect(cardTitles()).toEqual(['Kalamata Railway Park']);

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(cardTitles()).toHaveLength(18);
  });

  it('shows an EmptyPanel with "Clear filters" when nothing matches', async () => {
    await renderGuide();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the guide' }), { target: { value: 'zzzz' } });

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'No places match' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toHaveLength(18);
  });

  it('Save toggles aria-pressed and persists through the favourites store', async () => {
    await renderGuide();
    const save = screen.getByRole('button', { name: 'Save Kalamata Railway Park' });
    expect(save).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(save);

    expect(save).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('favorites:v1') ?? '[]')).toEqual(['moments:railway-park-kalamata']);
    // The saved count reaches the list header link to /favorites (O41).
    expect(screen.getByRole('link', { name: /Saved/ })).toHaveAttribute('href', '/en/favorites');
    expect(screen.getByRole('link', { name: /Saved/ })).toHaveTextContent('1');

    fireEvent.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem('favorites:v1') ?? '[]')).toEqual([]);
  });

  it('counts only saved ids that still resolve to a place, like the favourites page', async () => {
    await renderGuide();
    // A stale id (content removed since it was saved) next to a current one.
    window.localStorage.setItem('favorites:v1', JSON.stringify(['sightseeing:removed-place', 'moments:railway-park-kalamata']));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favorites:v1' })); });

    expect(screen.getByRole('link', { name: 'Saved places: 1' })).toHaveTextContent('1');
  });

  it('map view lists the filtered places without coordinates, so the count matches what is reachable', async () => {
    try {
      await renderGuide();
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      await screen.findByTestId('guide-map');
      const links = (name: string) => within(screen.getByRole('list', { name })).getAllByRole('link').map((link) => link.textContent);

      expect(screen.getByText('18 places')).toHaveAttribute('role', 'status');
      expect(links('Places on the map').length + links('Not on the map').length).toBe(18);

      // Neither beach has coordinates: no numbered list (and no note about its numbers), both beaches still listed.
      fireEvent.click(screen.getByRole('button', { name: 'Beaches 2' }));
      expect(screen.getByText('2 places')).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('list', { name: 'Places on the map' })).toBeNull();
      expect(screen.queryByText(/The numbers on the map match this list/)).toBeNull();
      expect(links('Not on the map')).toEqual(['Kalamata City Beach (Navarinou Avenue)', 'Gialova Lagoon and Voidokilia Beach']);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('renders the Greek page with Greek labels', async () => {
    await renderGuide('el');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Οδηγός Καλαμάτας');
    expect(screen.getByRole('searchbox', { name: 'Αναζήτηση στον οδηγό' })).toBeInTheDocument();
    expect(screen.getByText('18 μέρη')).toHaveAttribute('role', 'status');
  });
});
