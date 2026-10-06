// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: vi.fn() } }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';
import { Icon } from '@/components/icons/Icon';
import { ToastProvider } from '@/components/Toast';
import { locationPanelTranslations } from '@/i18n/domains/house';

describe('check-in location highlights', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      const body = url === '/api/check-in/preferences'
        ? { checkInTime: '15:00', checkOutTime: '11:00', canEdit: false, wifi: null, wifiAvailableAt: null }
        : { request: null };
      return new Response(JSON.stringify({ success: true, data: body }), { status: 200 });
    });
  });

  it.each(['en', 'el'] as const)('draws each highlight with its own icon (%s)', async (locale) => {
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
