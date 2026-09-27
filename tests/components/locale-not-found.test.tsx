// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ current: '/en/does-not-exist' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

import LocaleNotFound from '@/app/[locale]/not-found';

describe('locale not-found page', () => {
  it('explains the missing page in English and links to the English home page', () => {
    pathname.current = '/en/does-not-exist';
    render(<LocaleNotFound />);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/en');
  });

  it('uses Greek on /el paths', () => {
    pathname.current = '/el/moments/nope';
    render(<LocaleNotFound />);

    expect(screen.getByRole('heading', { name: 'Η σελίδα δεν βρέθηκε' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Αρχική' })).toHaveAttribute('href', '/el');
  });
});
