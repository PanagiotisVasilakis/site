// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeDialogMethods, stubIntersectionObserver, stubMatchMedia } from '../support/dom';

const navigation = vi.hoisted(() => ({ pathname: '/en', search: '' }));
const session = vi.hoisted(() => ({ isSignedIn: false, portalEnabled: true, checkinEnabled: true, signOut: vi.fn() }));
const pointerEffects = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => router,
}));
vi.mock('@/hooks/useGuestSession', () => ({
  useGuestSession: () => ({
    isSignedIn: session.isSignedIn,
    portalEnabled: session.portalEnabled,
    checkinEnabled: session.checkinEnabled,
    signOut: session.signOut,
  }),
}));
vi.mock('@/lib/motion/pointerEffects', () => ({ usePointerEffects: pointerEffects }));

import { ToastProvider } from '@/components/Toast';
import DocumentLocale from '@/components/DocumentLocale';
import BookBar from '@/components/shell/BookBar';
import LanguageSwitch from '@/components/shell/LanguageSwitch';
import SiteFooter from '@/components/shell/SiteFooter';
import SiteHeader from '@/components/shell/SiteHeader';
import { HOST_CONTACT } from '@/data/contact';
import { useScroll } from '@/hooks/useScroll';
import { getDictionary } from '@/i18n/dictionaries';

function installDialog() {
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  return { showModal, close };
}

function clickPrevented(element: HTMLElement): boolean {
  let prevented = false;
  const record = (event: Event) => { prevented = event.defaultPrevented; event.preventDefault(); };
  document.addEventListener('click', record, { once: true });
  fireEvent.click(element);
  document.removeEventListener('click', record);
  return prevented;
}

const inToasts = { wrapper: ToastProvider };
const FAILED_SIGN_OUT = { en: "We couldn't sign you out. Try again.", el: 'Δεν ήταν δυνατή η αποσύνδεση. Δοκιμάστε ξανά.' } as const;

describe('site shell', () => {
  let dialog: ReturnType<typeof installDialog>;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigation.pathname = '/en';
    navigation.search = '';
    session.isSignedIn = false;
    session.portalEnabled = true;
    session.checkinEnabled = true;
    session.signOut.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    pointerEffects.mockReset();
    dialog = installDialog();
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    stubMatchMedia(false);
    window.history.replaceState(null, '', '/en');
  });

  afterEach(() => {
    removeDialogMethods();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    vi.unstubAllGlobals();
  });

  it('opens the modal menu, restores focus on Escape, closes on backdrop/button clicks, and ignores inside clicks', async () => {
    const user = userEvent.setup();
    render(<SiteHeader locale="en" />, inToasts);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    const menu = screen.getByRole<HTMLDialogElement>('dialog', { name: 'Menu' });
    expect(menu).toHaveAttribute('open');

    const closeButton = within(menu).getByRole('button', { name: 'Close menu' });
    act(() => closeButton.focus());
    fireEvent(menu, new Event('cancel'));
    act(() => menu.close());
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(menu).getByText('Menu'));
    expect(menu).toHaveAttribute('open');
    fireEvent.click(menu);
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(menu).getByRole('button', { name: 'Close menu' }));
    expect(menu).not.toHaveAttribute('open');
  });

  it('renders marketing header nav with aria-current, menu contacts, and brand intro cleanup', () => {
    document.documentElement.setAttribute('data-intro', '');
    navigation.pathname = '/el/apartment';
    const { container } = render(<SiteHeader locale="el" />, inToasts);
    expect(container.querySelector('.site-header__progress')).toHaveAttribute('aria-hidden', 'true');
    expect(pointerEffects).toHaveBeenCalledWith(true);

    const nav = screen.getAllByRole('navigation', { name: 'Κύρια πλοήγηση' })[0];
    expect(within(nav).getByRole('link', { name: 'Διαμέρισμα' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/el/apartment', '/el/availability', '/el/moments', '/el#contact', '/el/stay',
    ]);
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: /Κλήση|Call/, hidden: true })).toHaveAttribute('href', 'tel:+306955810051');

    const brand = screen.getByRole('link', { name: /Dolce Far Niente/ });
    const end = (animationName: string) => fireEvent(brand, Object.assign(new Event('animationend', { bubbles: true }), { animationName }));
    end('brand-waves-draw');
    expect(document.documentElement).toHaveAttribute('data-intro');
    end('brand-sun-rise');
    expect(document.documentElement).not.toHaveAttribute('data-intro');
  });

  it.each(['/en/stay', '/el/offline', '/en/guest', '/en/check-in', '/el/portal/refresh'])(
    'hides booking links and disables pointer effects on stay route %s',
    (pathname) => {
      navigation.pathname = pathname;
      const locale = pathname.slice(1, 3);
      const { container } = render(<><SiteHeader locale={locale} /><SiteFooter locale={locale} /></>, inToasts);
      const hrefs = Array.from(container.querySelectorAll('a[href]'), (link) => link.getAttribute('href') ?? '');
      expect(hrefs.filter((href) => /\/availability|booking\.com/i.test(href))).toEqual([]);
      expect(container.querySelector('.site-header__progress')).toBeNull();
      expect(pointerEffects).toHaveBeenCalledWith(false);
    },
  );

  it('adapts account links to portal/check-in flags and signs out from menu or stay header with failure toast', async () => {
    const user = userEvent.setup();
    session.portalEnabled = false;
    session.checkinEnabled = false;
    const off = render(<SiteHeader locale="en" />, inToasts);
    expect(off.container.querySelector('.mobile-menu__account')).toBeNull();
    off.unmount();

    session.portalEnabled = true;
    session.checkinEnabled = false;
    const signedOutCheckinOff = render(<SiteHeader locale="en" />, inToasts);
    const hiddenMenu = screen.getByRole('dialog', { hidden: true });
    expect(within(hiddenMenu).getByRole('link', { name: 'Sign in', hidden: true })).toHaveAttribute('href', '/en/guest?mode=signin');
    expect(within(hiddenMenu).queryByRole('link', { name: /Check-in/i, hidden: true })).toBeNull();
    signedOutCheckinOff.unmount();

    session.isSignedIn = true;
    session.checkinEnabled = true;
    navigation.pathname = '/en/check-in';
    session.signOut.mockResolvedValueOnce(true);
    const signedInMenu = render(<SiteHeader locale="en" />, inToasts);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: /Check-in/i })).toHaveAttribute('href', '/en/check-in');
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    signedInMenu.unmount();

    session.signOut.mockResolvedValueOnce(false);
    navigation.pathname = '/el/stay';
    render(<SiteHeader locale="el" />, inToasts);
    await user.click(screen.getByRole('button', { name: 'Αποσύνδεση' }));
    expect(await screen.findByText(FAILED_SIGN_OUT.el)).toBeInTheDocument();
  });

  it('renders footer variants, contacts, host identity, and scrolls #contact on second click (R-689)', async () => {
    const user = userEvent.setup();
    const { container } = render(<><SiteHeader locale="en" /><SiteFooter locale="en" /></>, inToasts);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('site-footer--marketing');
    expect(within(footer).getByRole('link', { name: getDictionary('en').legal.privacyLink })).toHaveAttribute('href', '/en/privacy');
    expect(within(within(footer).getByRole('group', { name: 'Theme' })).getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    const identity = footer.querySelector('.host-identity') as HTMLElement;
    expect(within(identity).getByText(HOST_CONTACT.legalName)).toBeInTheDocument();
    expect(within(identity).queryByRole('link')).toBeNull();
    expect(within(container.querySelector('#contact') as HTMLElement).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      'tel:+306955810051', 'mailto:dolcefarnienteapartments@gmail.com', 'https://www.instagram.com/dolcefarniente_kalamata', 'https://wa.me/306955810051',
    ]);

    const navContact = within(screen.getAllByRole('navigation', { name: 'Primary navigation' })[0]).getByRole('link', { name: 'Contact' });
    const footerContact = within(footer).getByRole('link', { name: 'Contact' });
    expect(clickPrevented(navContact)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();

    window.history.pushState(null, '', '/en#contact');
    expect(clickPrevented(navContact)).toBe(true);
    expect(clickPrevented(footerContact)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView.mock.contexts).toEqual([document.getElementById('contact'), document.getElementById('contact')]);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(clickPrevented(within(menu).getByRole('link', { name: 'Contact' }))).toBe(true);
    expect(menu).not.toHaveAttribute('open');
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });
});

describe('LanguageSwitch and DocumentLocale', () => {
  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('preserves query/hash and updates links on hashchange', async () => {
    navigation.pathname = '/en/apartment';
    navigation.search = 'm=2026-10';
    window.history.replaceState(null, '', '/en/apartment?m=2026-10#living');
    render(<LanguageSwitch locale="en" label="Language" />);

    const group = screen.getByRole('group', { name: 'Language' });
    const greek = await within(group).findByRole('link', { name: 'Ελληνικά' });
    expect(greek).toHaveAttribute('href', '/el/apartment?m=2026-10#living');
    expect(greek).toHaveAttribute('hreflang', 'el');
    expect(within(group).getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true');

    window.history.replaceState(null, '', '/en/apartment?m=2026-10#kitchen');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('link', { name: 'Ελληνικά' })).toHaveAttribute('href', '/el/apartment?m=2026-10#kitchen');
  });

  it('synchronizes documentElement.lang on mount and rerender', () => {
    const { rerender } = render(<DocumentLocale locale="en" />);
    expect(document.documentElement.lang).toBe('en');
    rerender(<DocumentLocale locale="el" />);
    expect(document.documentElement.lang).toBe('el');
  });
});

describe('BookBar and useScroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggles BookBar visibility via IntersectionObserver and handles missing note or observer', () => {
    const io = stubIntersectionObserver();
    const { container, unmount } = render(
      <>
        <section data-hero>Hero</section>
        <div data-cta-watch>Contact</div>
        <BookBar note="Free tonight" href="/en/availability" ctaLabel="Check dates" />
      </>,
    );
    const bar = container.querySelector('.bookbar');
    const [hero, cta] = Array.from(container.querySelectorAll('[data-hero], [data-cta-watch]'));
    const shown = () => Boolean(bar?.classList.contains('is-shown')) && !bar?.hasAttribute('inert');

    expect(shown()).toBe(false);
    expect(bar).toHaveAttribute('inert');
    io.report(new Map([[hero, false], [cta, false]]));
    expect(shown()).toBe(true);
    io.report(new Map([[cta, true]]));
    expect(shown()).toBe(false);
    io.report(new Map([[cta, false], [hero, true]]));
    expect(shown()).toBe(false);
    unmount();

    expect(render(<BookBar note={null} href="/en/availability" ctaLabel="Check dates" />).container.querySelector('.bookbar')).toBeNull();

    vi.stubGlobal('IntersectionObserver', undefined);
    const noIo = render(<BookBar note="Free tonight" href="/en/availability" ctaLabel="Check dates" />);
    expect(noIo.container.querySelector('.bookbar')?.classList.contains('is-shown')).toBe(false);
  });

  it('tracks scrollY threshold at mount and on scroll events', () => {
    vi.stubGlobal('scrollY', 24);
    const { result, unmount } = renderHook(() => useScroll(24));
    expect(result.current.scrolled).toBe(false);

    vi.stubGlobal('scrollY', 100);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(result.current.scrolled).toBe(true);

    vi.stubGlobal('scrollY', 0);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(result.current.scrolled).toBe(false);
    unmount();

    vi.stubGlobal('scrollY', 600);
    expect(renderHook(() => useScroll(24)).result.current.scrolled).toBe(true);
  });
});
