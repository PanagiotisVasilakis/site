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

describe('not-found pages (identity §9.10)', () => {
  it.each([
    ['/en/does-not-exist', 'This page is taking a siesta.', [['Home', '/en'], ['Kalamata guide', '/en/moments'], ['Your stay', '/en/stay']]],
    ['/el/moments/nope', 'Αυτή η σελίδα κάνει σιέστα.', [['Αρχική', '/el'], ['Οδηγός Καλαμάτας', '/el/moments'], ['Η διαμονή σας', '/el/stay']]],
  ])('renders localized links on LocaleNotFound for %s', (path, heading, expectedLinks) => {
    pathname.current = path;
    const { container } = render(<LocaleNotFound />);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(linkTargets()).toEqual(expectedLinks);
    expect(container.querySelector('img')).toBeNull();
  });

  it('detects locale in RootNotFound inside main#main-content', () => {
    pathname.current = '/el/a/b/c';
    render(<RootNotFound />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'Αυτή η σελίδα κάνει σιέστα.' })).toBeInTheDocument();
    expect(linkTargets().map(([, href]) => href)).toContain('/el/stay');
  });
});

describe('error boundaries (identity §9.10)', () => {
  it.each([
    ['locale', LocaleError],
    ['root', RootError],
  ])('%s boundary invokes retry(), hides raw error internals, and translates for /el', (_name, ErrorPage) => {
    pathname.current = '/en/apartment';
    const retry = vi.fn();
    const error = Object.assign(new Error('secret stack detail'), { digest: 'digest-123' });
    const { container, unmount } = render(<ErrorPage error={error} retry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(linkTargets()).toEqual([['Home', '/en']]);
    expect(container).not.toHaveTextContent('secret stack detail');
    expect(container).not.toHaveTextContent('digest-123');
    unmount();

    pathname.current = '/el';
    render(<ErrorPage error={new Error('x')} retry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Δοκιμάστε ξανά' })).toBeInTheDocument();
  });

  it('reports caught errors once through errorReporter with category localeError', () => {
    vi.mocked(errorReporter.reportError).mockClear();
    pathname.current = '/en/apartment';
    const error = new Error('render failed');
    render(<LocaleError error={error} retry={vi.fn()} />);

    expect(errorReporter.reportError).toHaveBeenCalledOnce();
    expect(errorReporter.reportError).toHaveBeenCalledWith(error, { category: 'localeError' });
  });
});
