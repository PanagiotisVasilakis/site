// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'el' }),
  usePathname: () => '/el',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => { throw new Error('notFound'); },
}));
vi.mock('next/dynamic', () => ({ default: () => function DynamicStub() { return null; } }));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: vi.fn() } }));

import ItemPage from '@/app/[locale]/[category]/[slug]/page';
import CheckInInfo from '@/components/CheckInInfo';
import { Icon } from '@/components/icons/Icon';
import { ToastProvider } from '@/components/Toast';
import { getDictionary } from '@/i18n/dictionaries';
import { locationPanelTranslations } from '@/i18n/domains/house';
import { getItemsByCategory } from '@/lib/data';

/** The detail page's own header (meta, title, lead), which excludes the "More nearby" cards. */
function placeHeader(): HTMLElement {
  const header = screen.getByRole('heading', { level: 1 }).closest('header');
  if (!header) throw new Error('detail page header not found');
  return header;
}

describe('Greek copy', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      const body = url === '/api/check-in/preferences'
        ? { checkInTime: '15:00', checkOutTime: '11:00', wifi: null, wifiAvailableAt: null }
        : { request: null };
      return new Response(JSON.stringify({ success: true, data: body }), { status: 200 });
    });
  });
  it('shows translated tags on a phones detail page', async () => {
    render(<ToastProvider>{await ItemPage({ params: Promise.resolve({ locale: 'el', category: 'phones', slug: 'emergency-112' }) })}</ToastProvider>);

    const el = getDictionary('el').momentTags!;
    // The place's own meta, not only its "More nearby" cards, shows the translated tag (identity §9.5).
    expect(within(placeHeader()).getByText(el.emergency)).toBeInTheDocument();
    expect(screen.queryByText('emergency')).not.toBeInTheDocument();
  });

  it.each([
    ['el', 'Γρήγορες ενέργειες', ['Αντιγραφή Wi-Fi', 'Άνοιγμα χάρτη', 'Βασικά για τη διαμονή', 'Βασικά', 'Ασφάλεια', 'Τζάκι']],
    ['en', 'Quick actions', ['Copy Wi-Fi', 'Open Maps', 'Guest Essentials', 'Essentials', 'Safety', 'Fireplace']],
  ] as const)('renders the check-in panel strings and amenity groups in %s', (locale, quickActions, texts) => {
    const { container } = render(<ToastProvider><CheckInInfo locale={locale} /></ToastProvider>);

    expect(container.querySelector(`[aria-label="${quickActions}"]`)).not.toBeNull();
    for (const text of texts) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it.each([
    ['en', 'Need a taxi? Call +30 27210 21112 or use the Taxi app'],
    ['el', 'Χρειάζεστε ταξί; Καλέστε +30 27210 21112 ή χρησιμοποιήστε την εφαρμογή Taxi'],
  ] as const)('names the taxi number from the phone directory in the %s check-in tips', (locale, tip) => {
    const nearbyServices = getItemsByCategory('phones').map((item) => ({ id: item.id, name: item.name, phone: item.phone, phones: item.phones }));
    render(<ToastProvider><CheckInInfo locale={locale} nearbyServices={nearbyServices} /></ToastProvider>);

    expect(screen.getByText(tip)).toBeInTheDocument();
  });

  it.each(['en', 'el'] as const)('draws each check-in location highlight with its own icon (%s)', async (locale) => {
    render(<ToastProvider><CheckInInfo locale={locale} /></ToastProvider>);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/check-in/preferences'));

    const highlights = locationPanelTranslations[locale].highlights;
    expect(highlights.length).toBeGreaterThan(0);
    for (const { icon, title } of highlights) {
      const card = screen.getByRole('heading', { level: 3, name: title }).closest('.checkin-card');
      const expected = document.createElement('div');
      expected.innerHTML = renderToStaticMarkup(<Icon name={icon} />);
      expect(card?.querySelector('svg')?.innerHTML, `${title} → ${icon}`).toBe(
        expected.querySelector('svg')?.innerHTML,
      );
    }
  });
});
