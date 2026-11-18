// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    locale: 'en',
    search: new URLSearchParams('mode=signin'),
    replace,
    router: { push: vi.fn(), replace, refresh: vi.fn() },
  };
});
const fetchMock = vi.hoisted(() => vi.fn());
const emitMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.search,
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/sessionSignals', () => ({ emitGuestSessionChanged: emitMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

const PHONE = '+306912345678';
const PASSWORD = 'correct-horse-battery';

// A Response body can be read once, so every request gets a response of its own.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fillSignInForm() {
  render(<UnifiedGuestClient />);
  fireEvent.change(screen.getByLabelText(/phone/iu), { target: { value: PHONE } });
  fireEvent.change(screen.getByLabelText(/^password/iu), { target: { value: PASSWORD } });
}

function submitForm() {
  fireEvent.submit(document.querySelector('form')!);
}

function signIn(status: number, code: string) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code, message: 'x' } }), { status }));
  fillSignInForm();
  submitForm();
}

describe('guest sign-in errors', () => {
  beforeEach(() => {
    navigation.locale = 'en';
    navigation.search = new URLSearchParams('mode=signin');
  });

  it('names both causes of a refused sign-in: credentials or the access window', async () => {
    signIn(401, 'UNAUTHORIZED');

    expect(await screen.findByText(/Check your phone number and password\. Access opens about 7 days before check-in and closes shortly after the check-out date\./u)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the generic message for other failures', async () => {
    signIn(429, 'RATE_LIMITED');

    expect(await screen.findByText('Too many attempts. Please wait up to an hour and try again.')).toBeInTheDocument();
  });
});

describe('guest sign-in flow', () => {
  beforeEach(() => {
    navigation.locale = 'en';
    navigation.search = new URLSearchParams('mode=signin');
  });

  it('posts the credentials, announces the new session and opens the page the server names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { bookingId: 'booking-1', redirect: '/en/stay' } }));
    fillSignInForm();
    submitForm();

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/en/stay'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone: PHONE, password: PASSWORD, remember: true });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith('signin');
  });

  it('falls back to the en check-in page when the server names no redirect', async () => {
    navigation.locale = 'en';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { bookingId: 'booking-1' } }));
    render(<UnifiedGuestClient />);
    fireEvent.change(document.getElementById('guest-phone')!, { target: { value: PHONE } });
    fireEvent.change(document.getElementById('guest-password')!, { target: { value: PASSWORD } });
    submitForm();

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/en/check-in'));
    expect(emitMock).toHaveBeenCalledWith('signin');
  });

  it('shows the network error and enables the button again when the request cannot be sent', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fillSignInForm();
    submitForm();

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Please check your connection and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('disables the button and marks it busy while the request is pending, then enables it again', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    fillSignInForm();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    submitForm();

    const busy = screen.getByRole('button', { name: 'Working…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');

    pending.resolve(jsonResponse(429, { success: false, error: { code: 'RATE_LIMITED', message: 'x' } }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const idle = screen.getByRole('button', { name: 'Continue' });
    expect(idle).toBeEnabled();
    expect(idle).toHaveAttribute('aria-busy', 'false');
  });

  it('removes the error when the guest chooses Try again', async () => {
    signIn(429, 'RATE_LIMITED');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('guest page flash messages', () => {
  const GREEK_SESSION_REQUIRED = 'Συνδεθείτε για να δείτε τις πληροφορίες της διαμονής σας.';

  beforeEach(() => {
    navigation.locale = 'el';
    navigation.replace.mockImplementation((href: string) => {
      navigation.search = new URL(href, 'https://guide.test').searchParams;
    });
  });

  it('shows the localized message for a known code and strips it from the URL', async () => {
    navigation.search = new URLSearchParams('flash=session_required');
    render(<UnifiedGuestClient />);

    expect(screen.getByText(GREEK_SESSION_REQUIRED)).toBeInTheDocument();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/el/guest', { scroll: false }));
  });

  it('never renders free text passed in the URL', () => {
    navigation.search = new URLSearchParams('flash=Your+account+is+locked.+Call+%2B1-555-0100');
    render(<UnifiedGuestClient />);

    expect(screen.queryByText(/account is locked/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not bring the flash message back after switching tabs', async () => {
    navigation.search = new URLSearchParams('flash=session_required');
    const { rerender } = render(<UnifiedGuestClient />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/el/guest', { scroll: false }));
    rerender(<UnifiedGuestClient />);

    fireEvent.click(screen.getByRole('tab', { name: 'Εγγραφή' }));
    rerender(<UnifiedGuestClient />);

    await waitFor(() => expect(navigation.search.get('mode')).toBe('signup'));
    rerender(<UnifiedGuestClient />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
