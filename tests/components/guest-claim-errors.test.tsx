// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';

const navigation = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return { locale: 'en', router };
});
const fetchMock = vi.hoisted(() => vi.fn());
const emitMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams('mode=signup'),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/sessionSignals', () => ({ emitGuestSessionChanged: emitMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

const TOKEN = 'a'.repeat(43);
const PHONE = '+306912345678';
const PASSWORD = 'correct-horse-battery';
const JSON_HEADERS = { 'content-type': 'application/json' };

// A Response body can be read once, so every request gets a response of its own.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fillSignUpForm() {
  render(<UnifiedGuestClient />);
  fireEvent.change(document.getElementById('origin')!, { target: { value: 'GR' } });
  fireEvent.change(document.getElementById('claim-token')!, { target: { value: TOKEN } });
  fireEvent.change(screen.getByLabelText(/phone/iu), { target: { value: PHONE } });
  fireEvent.change(screen.getByLabelText(/^password/iu), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByLabelText(GUEST_TERMS_TEXT.en));
}

function submitForm() {
  fireEvent.submit(document.querySelector('form')!);
}

function signUp(status: number, code: string) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code, message: 'x' } }), { status }));
  fillSignUpForm();
  submitForm();
}

async function expectNetworkError() {
  expect(await screen.findByText('Network error')).toBeInTheDocument();
  expect(screen.getByText('Please check your connection and try again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(navigation.router.push).not.toHaveBeenCalled();
  expect(emitMock).not.toHaveBeenCalled();
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

    expect(await screen.findByText('Too many attempts. Please wait up to an hour and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/This claim token is invalid/u)).not.toBeInTheDocument();
  });
});

describe('guest claim flow', () => {
  beforeEach(() => { navigation.locale = 'en'; });

  it('exchanges the token first, then claims without it, clears the field and opens the page the server names', async () => {
    const exchange = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(exchange.promise)
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { bookingId: 'booking-1', redirect: '/en/stay' } }));
    fillSignUpForm();
    submitForm();
    // Let every promise that can settle without the exchange settle first: the claims request is
    // authorized by the cookie the exchange sets, so it must still be waiting for the exchange.
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/portal/claim-exchange', expect.objectContaining({ method: 'POST', headers: JSON_HEADERS }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ claimToken: TOKEN });

    exchange.resolve(jsonResponse(200, { success: true, data: { ready: true } }));
    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/en/stay'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/portal/claims', expect.objectContaining({ method: 'POST', headers: JSON_HEADERS }));
    const claimsBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(claimsBody).toEqual({ origin: 'GR', phone: PHONE, password: PASSWORD, remember: true, acceptTerms: true });
    expect(claimsBody).not.toHaveProperty('claimToken');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith('claim');
    await waitFor(() => expect(document.getElementById('claim-token')).toHaveValue(''));
  });

  it.each([
    [401, 'UNAUTHORIZED', "We couldn't verify your identity. Check your details and try again."],
    [409, 'CONFLICT', 'This action cannot be completed due to a conflict. Try again or contact support.'],
  ])('shows the mapped message when the claim fails with %s after a successful exchange', async (status, code, message) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ready: true } }))
      .mockResolvedValueOnce(jsonResponse(status, { success: false, error: { code, message: 'x' } }));
    fillSignUpForm();
    submitForm();

    expect(await screen.findByText(message)).toBeInTheDocument();
    // Only a refused exchange means that the token itself is bad.
    expect(screen.queryByText(/This claim token is invalid/u)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/portal/claim-exchange', '/api/portal/claims']);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('shows the network error and enables the button again when the exchange cannot be sent', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fillSignUpForm();
    submitForm();

    await expectNetworkError();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the network error and enables the button again when the claim cannot be sent after the exchange', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ready: true } }))
      .mockRejectedValueOnce(new Error('offline'));
    fillSignUpForm();
    submitForm();

    await expectNetworkError();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
