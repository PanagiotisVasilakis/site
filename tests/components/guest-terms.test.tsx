// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ locale: 'el' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('mode=signup'),
}));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';
import { GUEST_TERMS_CONTENT_HASH, GUEST_TERMS_VERSION } from '@/lib/guestTerms';
import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';

describe('guest terms acceptance', () => {
  it.each(['el', 'en'] as const)('renders exactly the canonical %s terms text on sign-up', (locale) => {
    navigation.locale = locale;
    render(<UnifiedGuestClient />);

    expect(screen.getByText(GUEST_TERMS_TEXT[locale])).toBeInTheDocument();
  });

  it('stores the hash of the rendered bilingual terms document', () => {
    const expected = createHash('sha256')
      .update(JSON.stringify({ version: GUEST_TERMS_VERSION, en: GUEST_TERMS_TEXT.en, el: GUEST_TERMS_TEXT.el }), 'utf8')
      .digest('hex');

    expect(GUEST_TERMS_CONTENT_HASH).toBe(expected);
  });
});
