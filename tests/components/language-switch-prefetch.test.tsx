// @vitest-environment jsdom

import type React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/apartment',
  useSearchParams: () => new URLSearchParams(''),
}));
// A plain anchor that exposes the prefetch prop: the app router is not mounted in jsdom.
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean | null }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>{children}</a>
  ),
}));

import LanguageSwitch from '@/components/shell/LanguageSwitch';

// A prefetch of the other-locale link would reach the proxy as a request for that locale's path, and Next
// strips its prefetch headers before the proxy runs, so the proxy cannot tell it from a visit and would
// rewrite the lang cookie (tests/unit/proxy-accept-language.test.ts). The only protection is that these
// links never prefetch.
describe('LanguageSwitch prefetching', () => {
  it('never prefetches the English or the Greek link', async () => {
    render(<LanguageSwitch locale="en" label="Language" />);

    const english = await screen.findByRole('link', { name: 'English' });
    const greek = screen.getByRole('link', { name: 'Ελληνικά' });
    expect(english).toHaveAttribute('data-prefetch', 'false');
    expect(greek).toHaveAttribute('data-prefetch', 'false');
    expect(greek).toHaveAttribute('href', '/el/apartment');
  });
});
