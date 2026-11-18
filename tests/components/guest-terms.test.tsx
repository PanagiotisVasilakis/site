// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ locale: 'el' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('mode=signup'),
}));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';
import { getDictionary } from '@/i18n/dictionaries';
import { GUEST_TERMS_CONTENT_HASH, GUEST_TERMS_VERSION } from '@/lib/guestTerms';
import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';

describe('guest terms acceptance', () => {
  it('renders exactly the canonical el terms text on sign-up', () => {
    navigation.locale = 'el';
    render(<UnifiedGuestClient />);

    expect(screen.getByText(GUEST_TERMS_TEXT.el)).toBeInTheDocument();
  });

  it('links the el privacy notice outside the hashed terms text', () => {
    navigation.locale = 'el';
    render(<UnifiedGuestClient />);

    const link = screen.getByRole('link', { name: getDictionary('el').legal.privacy.title });
    expect(link).toHaveAttribute('href', '/el/privacy');
    const terms = screen.getByText(GUEST_TERMS_TEXT.el);
    expect(terms.textContent).toBe(GUEST_TERMS_TEXT.el);
    expect(terms.contains(link)).toBe(false);
    expect(within(terms.closest('label')!).queryByRole('link')).toBeNull();
  });

  it('uses the privacy-notice wording and the version that introduced it', () => {
    expect(GUEST_TERMS_VERSION).toBe('2026-09-30');
    expect(GUEST_TERMS_TEXT).toEqual({
      en: 'I confirm my details are correct and have read the privacy notice.',
      el: 'Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και έχω διαβάσει την ενημέρωση για την προστασία δεδομένων.',
    });
  });

  it('stores the hash of the rendered bilingual terms document', () => {
    const expected = createHash('sha256')
      .update(JSON.stringify({ version: GUEST_TERMS_VERSION, en: GUEST_TERMS_TEXT.en, el: GUEST_TERMS_TEXT.el }), 'utf8')
      .digest('hex');

    expect(GUEST_TERMS_CONTENT_HASH).toBe(expected);
  });
});
