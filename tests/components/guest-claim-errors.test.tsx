// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';

const navigation = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return { locale: 'en', router };
});
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams('mode=signup'),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

function signUp(status: number, code: string) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code, message: 'x' } }), { status }));
  render(<UnifiedGuestClient />);
  fireEvent.change(document.getElementById('origin')!, { target: { value: 'GR' } });
  fireEvent.change(document.getElementById('claim-token')!, { target: { value: 'a'.repeat(43) } });
  fireEvent.change(screen.getByLabelText(/phone/iu), { target: { value: '+306912345678' } });
  fireEvent.change(screen.getByLabelText(/^password/iu), { target: { value: 'correct-horse-battery' } });
  fireEvent.click(screen.getByLabelText(GUEST_TERMS_TEXT.en));
  fireEvent.submit(document.querySelector('form')!);
}

describe('guest claim errors', () => {
  beforeEach(() => { navigation.locale = 'en'; });

  it('tells the guest the claim token was refused when the exchange returns 401', async () => {
    signUp(401, 'UNAUTHORIZED');

    expect(await screen.findByText('This claim token is invalid, expired or already used. Ask your host for a new one.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/claim-exchange', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the generic rate-limit message when the exchange returns 429', async () => {
    signUp(429, 'RATE_LIMITED');

    expect(await screen.findByText('Too many attempts. Please wait a minute and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/This claim token is invalid/u)).not.toBeInTheDocument();
  });
});
