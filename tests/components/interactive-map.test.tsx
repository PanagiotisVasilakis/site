// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('@/styles/components/map.css', () => ({}));

import InteractiveMap from '@/components/InteractiveMap';

// FGM-07: Leaflet makes the map focusable (tabindex 0), so it needs a role and a name. LeafletMap takes the name from
// its labels and InteractiveMap is the only caller that builds them, so this runs both with the real library
// (jsdom has no IntersectionObserver, so the deferred map renders at once) and pins the wiring that the dictionary
// key `map.mapRegion` reaches the page.
describe('InteractiveMap accessible name (FGM-07)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; the map follows the OS colour scheme for its tiles.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });

  it.each([
    ['en', 'Interactive map'],
    ['el', 'Διαδραστικός χάρτης'],
  ])('names the focusable map in the page language (%s)', async (locale, name) => {
    render(<InteractiveMap locale={locale} />);

    const region = await screen.findByRole('region', { name });
    expect(region).toHaveClass('leaflet-container');
    expect(region).toHaveAttribute('tabindex', '0');
  });
});
