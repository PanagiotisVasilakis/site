// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny router: replace() updates the search params the component reads.
const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  // Stable like Next's router object.
  return { locale: 'el', search: new URLSearchParams(), replace, router: { push: vi.fn(), replace, refresh: vi.fn() } };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.search,
}));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

const GREEK_SESSION_REQUIRED = 'Συνδεθείτε για να δείτε τις πληροφορίες της διαμονής σας.';

describe('guest page flash messages', () => {
  beforeEach(() => {
    navigation.locale = 'el';
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

  it('never renders free text passed in the URL', () => {
    navigation.search = new URLSearchParams('flash=Your+account+is+locked.+Call+%2B1-555-0100');
    render(<UnifiedGuestClient />);

    expect(screen.queryByText(/account is locked/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
  });
});
