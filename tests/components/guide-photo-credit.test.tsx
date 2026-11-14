// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/moments',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getItem: vi.fn(),
  getItemsByCategory: vi.fn(),
}));

import ItemPage from '@/app/[locale]/[category]/[slug]/page';
import { ToastProvider } from '@/components/Toast';
import type { Item } from '@/data/schemas';
import { getItem, getItemsByCategory } from '@/lib/data';

const credit = {
  author: 'A. Photographer',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Old_Town.jpg',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

function serve(item: Item) {
  vi.mocked(getItemsByCategory).mockImplementation((categoryId) => (categoryId === item.categoryId ? [item] : []));
  vi.mocked(getItem).mockImplementation((categoryId, slug) => (categoryId === item.categoryId && slug === item.slug ? item : null));
}

async function renderDetail(locale: 'en' | 'el', item: Item) {
  serve(item);
  const page = await ItemPage({ params: Promise.resolve({ locale, category: item.categoryId, slug: item.slug ?? 'old-town' }) });
  return render(<ToastProvider>{page}</ToastProvider>);
}

const base: Item = { id: 'old-town', categoryId: 'moments', name: 'Old Town', slug: 'old-town', heroImage: '/moments/old-town.jpg' };

describe('guide detail photo credit', () => {
  it('prints author, licence and source under the photo, and the links open safely', async () => {
    const { container } = await renderDetail('en', { ...base, heroImageCredit: credit });

    const line = container.querySelector('.guide-detail__credit');
    expect(line?.textContent).toContain('Photo: A. Photographer');
    const licence = screen.getByRole('link', { name: /CC BY-SA 4\.0/ });
    expect(licence).toHaveAttribute('href', credit.licenseUrl);
    const source = screen.getByRole('link', { name: /commons\.wikimedia\.org/ });
    expect(source).toHaveAttribute('href', credit.sourceUrl);
    for (const link of [licence, source]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('links the licence name to the source when no licence page is given, and prints the label in Greek', async () => {
    const { container } = await renderDetail('el', { ...base, heroImageCredit: { ...credit, licenseUrl: undefined } });

    expect(container.querySelector('.guide-detail__credit')?.textContent).toContain('Φωτογραφία: A. Photographer');
    expect(screen.getByRole('link', { name: /CC BY-SA 4\.0/ })).toHaveAttribute('href', credit.sourceUrl);
  });

  it('prints nothing for an entry that shows the art tile', async () => {
    const { container } = await renderDetail('en', { ...base, heroImage: undefined });

    expect(container.querySelector('.guide-detail__credit')).toBeNull();
  });
});
