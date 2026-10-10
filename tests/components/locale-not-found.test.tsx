// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ current: '/en/does-not-exist' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/lib/logger-client', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/errorReporting', () => ({ errorReporter: { reportError: vi.fn(async () => true) } }));

import LocaleNotFound from '@/app/[locale]/not-found';
import RootNotFound from '@/app/not-found';
import LocaleError from '@/app/[locale]/error';
import RootError from '@/app/error';
import { errorReporter } from '@/lib/errorReporting';

const linkTargets = () => screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]);

// identity §9.10: a centred brand mark, the siesta H1, a lead and three links; no photo.
describe('locale not-found page', () => {
  it('says the page is taking a siesta and offers Home, Kalamata guide and Your stay (en)', () => {
    pathname.current = '/en/does-not-exist';
    const { container } = render(<LocaleNotFound />);

    expect(screen.getByRole('heading', { level: 1, name: 'This page is taking a siesta.' })).toBeInTheDocument();
    expect(linkTargets()).toEqual([
      ['Home', '/en'],
      ['Kalamata guide', '/en/moments'],
      ['Your stay', '/en/stay'],
    ]);
    expect(container.querySelector('.status-page__mark svg')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('uses Greek on /el paths', () => {
    pathname.current = '/el/moments/nope';
    render(<LocaleNotFound />);

    expect(screen.getByRole('heading', { level: 1, name: 'Αυτή η σελίδα κάνει σιέστα.' })).toBeInTheDocument();
    expect(linkTargets()).toEqual([
      ['Αρχική', '/el'],
      ['Οδηγός Καλαμάτας', '/el/moments'],
      ['Η διαμονή σας', '/el/stay'],
    ]);
  });
});

// identity §9.10 root 404: a URL that matches no route renders outside the locale layout.
describe('root not-found page', () => {
  it.each([
    ['/en/moments/a/b', 'This page is taking a siesta.', '/en/stay'],
    ['/el/a/b/c', 'Αυτή η σελίδα κάνει σιέστα.', '/el/stay'],
  ])('renders the siesta page in the main landmark for %s', (path, title, stay) => {
    pathname.current = path;
    render(<RootNotFound />);

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(linkTargets().map(([, href]) => href)).toContain(stay);
  });
});

describe.each([
  ['locale error boundary', LocaleError],
  ['root error boundary', RootError],
])('%s (identity §9.10)', (_name, ErrorPage) => {
  // Next 16.3: only retry() re-fetches the segment; reset() re-renders the error it already received (R-396).
  it('shows "Something went wrong", a Try again button that calls retry(), a Home link and no technical details', () => {
    pathname.current = '/en/apartment';
    const retry = vi.fn();
    const error = Object.assign(new Error('secret stack detail'), { digest: 'digest-123' });
    const { container } = render(<ErrorPage error={error} retry={retry} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(linkTargets()).toEqual([['Home', '/en']]);
    expect(container).not.toHaveTextContent('secret stack detail');
    expect(container).not.toHaveTextContent('digest-123');
    expect(container.querySelector('.status-page__mark svg')).not.toBeNull();
  });

  it('speaks Greek on /el', () => {
    pathname.current = '/el';
    render(<ErrorPage error={new Error('x')} retry={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Κάτι πήγε στραβά' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Δοκιμάστε ξανά' })).toBeInTheDocument();
    expect(linkTargets()).toEqual([['Αρχική', '/el']]);
  });
});

// R-424: render errors of every localized page end up here, so this boundary has to feed /api/errors.
describe('locale error boundary reporting', () => {
  it('reports the caught error once with the localeError category', () => {
    pathname.current = '/en/apartment';
    const error = new Error('render failed');
    render(<LocaleError error={error} retry={vi.fn()} />);

    expect(errorReporter.reportError).toHaveBeenCalledTimes(1);
    expect(errorReporter.reportError).toHaveBeenCalledWith(error, { category: 'localeError' });
  });
});
