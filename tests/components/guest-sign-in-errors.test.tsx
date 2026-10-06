// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return { locale: 'en', router };
});
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams('mode=signin'),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

function signIn(status: number, code: string) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code, message: 'x' } }), { status }));
  render(<UnifiedGuestClient />);
  fireEvent.change(screen.getByLabelText(/phone/iu), { target: { value: '+306912345678' } });
  fireEvent.change(screen.getByLabelText(/^password/iu), { target: { value: 'correct-horse-battery' } });
  fireEvent.submit(document.querySelector('form')!);
}

describe('guest sign-in errors', () => {
  beforeEach(() => { navigation.locale = 'en'; });

  it('names both causes of a refused sign-in: credentials or the access window', async () => {
    signIn(401, 'UNAUTHORIZED');

    expect(await screen.findByText(/Check your phone number and password\. Access opens about 7 days before check-in and closes shortly after the check-out date\./u)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the generic message for other failures', async () => {
    signIn(429, 'RATE_LIMITED');

    expect(await screen.findByText('Too many attempts. Please wait a minute and try again.')).toBeInTheDocument();
  });
});
