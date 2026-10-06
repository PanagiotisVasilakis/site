// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Module factories run when a module is first imported, so these spies record the import itself.
const loads = vi.hoisted(() => ({ map: [] as string[], leaflet: [] as string[] }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/moments',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/components/ApartmentLocationMap', () => {
  loads.map.push('ApartmentLocationMap');
  return { default: () => <div data-testid="guide-map" /> };
});
vi.mock('leaflet', () => {
  loads.leaflet.push('leaflet');
  return { default: {} };
});

import CategoryPage from '@/app/[locale]/[category]/page';
import { ToastProvider } from '@/components/Toast';

describe('guide map (identity §9.5, R3-V8 acceptance)', () => {
  it('imports the map module only after the List/Map toggle, and never Leaflet with the list', async () => {
    render(
      <ToastProvider>{await CategoryPage({ params: Promise.resolve({ locale: 'en', category: 'moments' }) })}</ToastProvider>,
    );
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(18);
    // Let any dynamic import started on mount (a preload, an effect) settle before asserting it never ran.
    await vi.dynamicImportSettled();
    expect(loads.map).toEqual([]);
    expect(loads.leaflet).toEqual([]);

    const mapButton = screen.getByRole('button', { name: 'Map' });
    expect(mapButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mapButton);

    expect(await screen.findByTestId('guide-map')).toBeInTheDocument();
    expect(mapButton).toHaveAttribute('aria-pressed', 'true');
    expect(loads.map).toEqual(['ApartmentLocationMap']);
    // The numbered list stays below the map (the list is the primary navigation).
    expect(screen.getByRole('list', { name: 'Places on the map' })).toBeInTheDocument();
  });
});
