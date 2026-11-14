// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny router: replace() updates the search params the component reads.
const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  // Stable like Next's router object.
  return { locale: 'el', search: new URLSearchParams(), replace, router: { push: vi.fn(), replace, refresh: vi.fn() } };
});

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.search,
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

const GREEK_SESSION_REQUIRED = 'Συνδεθείτε για να δείτε τις πληροφορίες της διαμονής σας.';
const ENGLISH_SESSION_REQUIRED = 'Please sign in to see your stay information.';

const COPY = {
  en: {
    message: ENGLISH_SESSION_REQUIRED,
    heading: 'Sign in to your stay',
    errorTitle: 'There were some problems',
    buttons: /try again|contact support/iu,
    signInFailed: /Check your phone number and password/u,
  },
  el: {
    message: GREEK_SESSION_REQUIRED,
    heading: 'Συνδεθείτε στη διαμονή σας',
    errorTitle: 'Παρουσιάστηκαν κάποια προβλήματα',
    buttons: /Δοκιμάστε ξανά|Επικοινωνία με υποστήριξη/u,
    signInFailed: /Ελέγξτε τον αριθμό τηλεφώνου και τον κωδικό σας/u,
  },
} as const;

// The elements the Tab key can land on, in document order.
function tabStops(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

describe('guest page flash messages', () => {
  beforeEach(() => {
    navigation.locale = 'el';
    navigation.search = new URLSearchParams();
    navigation.replace.mockImplementation((href: string) => {
      navigation.search = new URL(href, 'https://guide.test').searchParams;
    });
  });

  it('shows the localized message for a known code and removes it from the URL', async () => {
    navigation.search = new URLSearchParams('flash=session_required');
    render(<UnifiedGuestClient />);

    expect(screen.getByText(GREEK_SESSION_REQUIRED)).toBeInTheDocument();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/el/guest', { scroll: false }));
  });

  it.each(['en', 'el'] as const)('opens the %s check-in link as a neutral note above the sign-in form, not as an error', (locale) => {
    const copy = COPY[locale];
    navigation.locale = locale;
    navigation.search = new URLSearchParams('flash=session_required');
    render(<UnifiedGuestClient />);

    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(copy.message);
    expect(note).toHaveClass('ui-callout', 'ui-callout--info');
    expect(note).not.toHaveClass('ui-callout--danger', 'error-summary');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(copy.errorTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.buttons })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.buttons })).not.toBeInTheDocument();
    expect(within(note).queryByRole('button')).not.toBeInTheDocument();
    expect(within(note).queryByRole('link')).not.toBeInTheDocument();

    // The heading comes first, then the note, then the form.
    const heading = screen.getByRole('heading', { level: 1, name: copy.heading });
    const form = document.querySelector('form')!;
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['en', 'el'] as const)('has the %s note in the server-rendered markup, so a QR-code visit does not see it pop in', (locale) => {
    navigation.locale = locale;
    navigation.search = new URLSearchParams('flash=session_required');
    const html = renderToStaticMarkup(<UnifiedGuestClient />);

    expect(html).toMatch(/<div[^>]*\brole="status"[^>]*>/u);
    expect(html).toContain(COPY[locale].message);
    expect(html).not.toContain('role="alert"');
  });

  it.each(['en', 'el'] as const)('keeps focus and the first Tab stop out of the %s note', (locale) => {
    navigation.locale = locale;
    navigation.search = new URLSearchParams('flash=session_required');
    render(<UnifiedGuestClient />);

    const note = screen.getByRole('status');
    expect(note.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(note.hasAttribute('tabindex')).toBe(false);
    expect(tabStops().some((stop) => note.contains(stop))).toBe(false);
    expect(tabStops()[0]).toBe(screen.getAllByRole('tab')[0]);
  });

  it.each(['en', 'el'] as const)('still renders the %s error summary for a refused sign-in after the note', async (locale) => {
    const copy = COPY[locale];
    navigation.locale = locale;
    navigation.search = new URLSearchParams('flash=session_required');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }), { status: 401 }));
    render(<UnifiedGuestClient />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());

    fireEvent.change(document.querySelector('#guest-phone')!, { target: { value: '+306912345678' } });
    fireEvent.change(document.querySelector('#guest-password')!, { target: { value: 'correct-horse-battery' } });
    fireEvent.submit(document.querySelector('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('ui-callout--danger', 'error-summary');
    expect(alert).toHaveTextContent(copy.errorTitle);
    expect(alert).toHaveTextContent(copy.signInFailed);
    expect(within(alert).getByRole('button', { name: copy.buttons })).toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: copy.buttons })).toBeInTheDocument();
    // ErrorSummary moves focus in a passive effect, which can land after the alert is found.
    await waitFor(() => expect(alert).toHaveFocus());
    // The note gives way to the error; it is not shown next to it.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('never renders free text passed in the URL', () => {
    navigation.search = new URLSearchParams('flash=Your+account+is+locked.+Call+%2B1-555-0100');
    render(<UnifiedGuestClient />);

    expect(screen.queryByText(/account is locked/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not bring the message back after switching tabs', async () => {
    navigation.search = new URLSearchParams('flash=session_required');
    const { rerender } = render(<UnifiedGuestClient />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/el/guest', { scroll: false }));
    rerender(<UnifiedGuestClient />);

    fireEvent.click(screen.getByRole('tab', { name: 'Εγγραφή' }));
    rerender(<UnifiedGuestClient />);

    await waitFor(() => expect(navigation.search.get('mode')).toBe('signup'));
    rerender(<UnifiedGuestClient />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(GREEK_SESSION_REQUIRED)).not.toBeInTheDocument();
  });
});
