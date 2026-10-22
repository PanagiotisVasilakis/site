// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { portalTranslations } from '@/i18n/domains/portal';
import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';

const navigation = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return { locale: 'en', mode: 'signin', router };
});
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams(`mode=${navigation.mode}`),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/sessionSignals', () => ({ emitGuestSessionChanged: vi.fn() }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

const TOKEN = 'a'.repeat(43);
const NATIONAL_NUMBER = '0151 1234567';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function renderForm(mode: 'signin' | 'signup', locale: 'en' | 'el' = 'en') {
  navigation.mode = mode;
  navigation.locale = locale;
  render(<UnifiedGuestClient />);
}

function fill(phone: string, password = 'correct-horse-battery', origin = 'ABROAD') {
  if (navigation.mode === 'signup') {
    fireEvent.change(document.getElementById('origin')!, { target: { value: origin } });
    fireEvent.change(document.getElementById('claim-token')!, { target: { value: TOKEN } });
    fireEvent.click(screen.getByLabelText(GUEST_TERMS_TEXT[navigation.locale as 'en' | 'el']));
  }
  fireEvent.change(screen.getByLabelText(/^(phone|αριθμός)/iu), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText(/^(password|κωδικός πρόσβασης)/iu), { target: { value: password } });
  fireEvent.submit(document.querySelector('form')!);
}

describe.each(['en', 'el'] as const)('guest sign-in and claim forms (%s)', (locale) => {
  const dictionary = portalTranslations[locale];

  beforeEach(() => {
    navigation.locale = locale;
    navigation.mode = 'signin';
  });

  it.each(['signin', 'signup'] as const)('show the country-code hint under the phone field in %s mode', (mode) => {
    renderForm(mode, locale);

    const phone = document.getElementById('guest-phone')!;
    const hint = document.getElementById('guest-phone-hint')!;
    expect(hint).toHaveTextContent(dictionary.phoneHint);
    expect(hint.textContent).toContain('+30 69');
    expect(phone).toHaveAttribute('aria-describedby', 'guest-phone-hint');
    expect(phone.parentElement).toContainElement(hint);
  });

  it('show the password rules only where a password is chosen', () => {
    renderForm('signin', locale);
    expect(document.getElementById('guest-password-hint')).toBeNull();
    expect(document.getElementById('guest-password')).not.toHaveAttribute('aria-describedby');
  });

  it('show the password rules in the claim form', () => {
    renderForm('signup', locale);

    expect(document.getElementById('guest-password-hint')).toHaveTextContent(dictionary.passwordHintSignup);
    expect(document.getElementById('guest-password')).toHaveAttribute('aria-describedby', 'guest-password-hint');
  });

  it('answer a national-format number at sign-in with the hint and no request', async () => {
    renderForm('signin', locale);
    fill(NATIONAL_NUMBER);

    expect((await screen.findAllByText(dictionary.phoneHint)).length).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it('answer a national-format number in the claim form before the token exchange, with no request', async () => {
    renderForm('signup', locale);
    fill(NATIONAL_NUMBER);

    expect((await screen.findAllByText(dictionary.phoneHint)).length).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('guest forms with a readable number', () => {
  beforeEach(() => {
    navigation.locale = 'en';
    navigation.mode = 'signin';
  });

  it('sign a Greek guest in with the ten-digit local number, which the server reads as +30', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { bookingId: 'booking-1', redirect: '/en/stay' } }));
    renderForm('signin');
    fill('6912345678');

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/en/stay'));
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'POST' }));
  });

  it('claim with the ten-digit local number only when Greece is the origin', async () => {
    // A Response body can be read once, so every request gets a response of its own.
    fetchMock.mockImplementation(async () => jsonResponse(200, { success: true, data: { ready: true, bookingId: 'booking-1', redirect: '/en/stay' } }));
    renderForm('signup');
    fill('6912345678', 'correct-horse-battery', 'GR');

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/en/stay'));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/portal/claim-exchange', '/api/portal/claims']);
  });

  it('show the server\'s own 422 messages for a password it refuses, in the language it answered in', async () => {
    const tooLong = portalTranslations.el.errors.passwordTooLong;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ready: true } }))
      .mockResolvedValueOnce(jsonResponse(422, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { validationErrors: [{ path: 'password', message: tooLong, code: 'custom' }] },
        },
      }));
    renderForm('signup', 'el');
    fill('+306912345678', 'correct-horse-battery');

    expect(await screen.findByText(tooLong)).toBeInTheDocument();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });
});
