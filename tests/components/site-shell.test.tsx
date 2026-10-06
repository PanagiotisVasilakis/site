// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/en', search: '' }));
const session = vi.hoisted(() => ({ isSignedIn: false, signOut: vi.fn() }));
const pointerEffects = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/hooks/useGuestSession', () => ({
  useGuestSession: () => ({ isSignedIn: session.isSignedIn, signOut: session.signOut }),
}));
// The header's wiring only: the hook itself is covered in pointer-effects.test.tsx.
vi.mock('@/lib/motion/pointerEffects', () => ({ usePointerEffects: pointerEffects }));

import SiteHeader from '@/components/shell/SiteHeader';
import SiteFooter from '@/components/shell/SiteFooter';
import LanguageSwitch from '@/components/shell/LanguageSwitch';
import { getDictionary } from '@/i18n/dictionaries';

// jsdom has no HTMLDialogElement.showModal/close; these follow the spec's observable steps.
function installDialog() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  return { showModal, close };
}

function installMatchMedia(matches = false) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches, media, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
  }) as MediaQueryList);
}

const BOOKING_HREF = /\/availability|airbnb\./i;

describe('site shell', () => {
  let dialog: ReturnType<typeof installDialog>;

  beforeEach(() => {
    navigation.pathname = '/en';
    navigation.search = '';
    session.isSignedIn = false;
    dialog = installDialog();
    installMatchMedia(false);
    window.history.replaceState(null, '', '/en');
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('opens the menu as a modal dialog, closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    render(<SiteHeader locale="en" />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    // showModal (not show): the browser traps focus in the dialog and makes the page inert.
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    const menu = screen.getByRole<HTMLDialogElement>('dialog', { name: 'Menu' });
    expect(menu).toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // A real showModal moves focus into the dialog; the mock does not, so do it here. Otherwise focus never
    // leaves the trigger and the focus-return assertion below would prove nothing.
    const closeButton = within(menu).getByRole('button', { name: 'Close menu' });
    act(() => closeButton.focus());
    expect(closeButton).toHaveFocus();

    // Escape fires `cancel`, then the dialog closes (native behaviour).
    fireEvent(menu, new Event('cancel'));
    act(() => menu.close());
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes the menu on a backdrop click and on its close button, and not on a click inside the sheet', async () => {
    const user = userEvent.setup();
    render(<SiteHeader locale="en" />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });

    await user.click(trigger);
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    await user.click(within(menu).getByText('Menu'));
    expect(menu).toHaveAttribute('open');
    fireEvent.click(menu); // the ::backdrop hit-tests as the dialog element itself
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(menu).getByRole('button', { name: 'Close menu' }));
    expect(menu).not.toHaveAttribute('open');
  });

  it('renders the marketing header nav, CTA, menu contact rows and the decorative scroll hairline', () => {
    const { container } = render(<SiteHeader locale="en" />);
    expect(container.querySelector('.site-header__progress')).toHaveAttribute('aria-hidden', 'true');
    expect(pointerEffects).toHaveBeenCalledWith(true);
    const nav = screen.getAllByRole('navigation', { name: 'Primary navigation' })[0];
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/en/apartment', '/en/availability', '/en/moments', '/en#contact',
    ]);
    expect(screen.getByRole('link', { name: 'Check dates' })).toHaveAttribute('href', '/en/availability');
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: /Call/, hidden: true })).toHaveAttribute('href', 'tel:+306955810051');
    expect(within(menu).getByRole('link', { name: /WhatsApp/, hidden: true })).toHaveAttribute('href', 'https://wa.me/306955810051');
  });

  it('marks the current page with aria-current', () => {
    navigation.pathname = '/el/apartment';
    render(<SiteHeader locale="el" />);
    const nav = screen.getAllByRole('navigation', { name: 'Κύρια πλοήγηση' })[0];
    expect(within(nav).getByRole('link', { name: 'Διαμέρισμα' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Διαθεσιμότητα' })).not.toHaveAttribute('aria-current');
  });

  it.each(['/en/stay', '/en/guest', '/en/check-in', '/el/portal/refresh', '/el/offline'])(
    'renders no booking, availability or Airbnb link in the stay header, menu and footer (%s)',
    (pathname) => {
      navigation.pathname = pathname;
      const locale = pathname.slice(1, 3);
      const { container } = render(<><SiteHeader locale={locale} /><SiteFooter locale={locale} /></>);
      const hrefs = Array.from(container.querySelectorAll('a[href]'), (link) => link.getAttribute('href') ?? '');
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.filter((href) => BOOKING_HREF.test(href))).toEqual([]);
      expect(hrefs).toContain(`/${locale}/stay`);
      expect(hrefs).toContain(`/${locale}/moments`);
      expect(container.querySelector('.site-header__progress')).toBeNull();
      // §5.1 calm mode: no tilt or magnetic pull on stay routes.
      expect(pointerEffects).toHaveBeenCalledWith(false);
      expect(pointerEffects).not.toHaveBeenCalledWith(true);
    },
  );

  it('ends the once-per-session brand intro when the sun has risen (R3-V14 M26)', () => {
    document.documentElement.setAttribute('data-intro', '');
    render(<SiteHeader locale="en" />);
    const brand = screen.getByRole('link', { name: /Dolce Far Niente/ });
    // jsdom has no AnimationEvent: a plain bubbling event carrying the animation name.
    const end = (animationName: string) => fireEvent(brand, Object.assign(new Event('animationend', { bubbles: true }), { animationName }));
    end('brand-waves-draw');
    expect(document.documentElement).toHaveAttribute('data-intro');
    end('brand-sun-rise');
    expect(document.documentElement).not.toHaveAttribute('data-intro');
  });

  it('offers sign-in, and no check-in link, to a signed-out visitor', () => {
    render(<SiteHeader locale="en" />);
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: 'Sign in', hidden: true })).toHaveAttribute('href', '/en/guest?mode=signin');
    expect(within(menu).queryByRole('link', { name: /Check-in/i, hidden: true })).toBeNull();
  });

  it('offers sign-out to a signed-in guest in the menu', async () => {
    session.isSignedIn = true;
    session.signOut.mockResolvedValue(true);
    const user = userEvent.setup();
    navigation.pathname = '/en/check-in';
    render(<SiteHeader locale="en" />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: /Check-in/i })).toHaveAttribute('href', '/en/check-in');
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });

  it('renders the marketing footer with contact rows and the "Your stay" link', () => {
    render(<SiteFooter locale="en" />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /Staying with us now\? Your stay/ })).toHaveAttribute('href', '/en/stay');
    expect(within(footer).getByRole('link', { name: 'dolcefarnienteapartments@gmail.com' })).toHaveAttribute(
      'href', 'mailto:dolcefarnienteapartments@gmail.com',
    );
    expect(within(footer).getByRole('button', { name: 'Reduce motion' })).toBeInTheDocument();
    expect(within(footer).getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });

  it.each([
    ['en', '/en', 'marketing'],
    ['en', '/en/moments', 'marketing'],
    ['en', '/en/guest', 'stay'],
    ['el', '/el', 'marketing'],
    ['el', '/el/check-in', 'stay'],
  ] as const)('links the privacy notice in the %s footer of %s (%s)', (locale, pathname, variant) => {
    navigation.pathname = pathname;
    render(<SiteFooter locale={locale} />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass(`site-footer--${variant}`);
    expect(within(footer).getByRole('link', { name: getDictionary(locale).legal.privacyLink }))
      .toHaveAttribute('href', `/${locale}/privacy`);
  });

  it.each(['/en', '/en/guest'])('offers Auto · Day · Night in the footer at every width (%s)', (pathname) => {
    navigation.pathname = pathname;
    render(<SiteFooter locale="en" />);
    const theme = within(screen.getByRole('contentinfo')).getByRole('group', { name: 'Theme' });
    expect(within(theme).getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('LanguageSwitch', () => {
  beforeEach(() => {
    navigation.pathname = '/en/apartment';
    navigation.search = 'm=2026-10';
    window.history.replaceState(null, '', '/en/apartment?m=2026-10#living');
  });

  it('links to the same page in each locale, keeping the query and the hash', async () => {
    render(<LanguageSwitch locale="en" label="Language" />);
    const group = screen.getByRole('group', { name: 'Language' });
    const greek = await within(group).findByRole('link', { name: 'Ελληνικά' });
    expect(greek).toHaveAttribute('href', '/el/apartment?m=2026-10#living');
    expect(greek).toHaveAttribute('hreflang', 'el');
    expect(greek).toHaveAttribute('lang', 'el');
    expect(greek).toHaveTextContent('ΕΛ');
    expect(greek).not.toHaveAttribute('aria-current');
    const english = within(group).getByRole('link', { name: 'English' });
    expect(english).toHaveAttribute('aria-current', 'true');
    expect(english).toHaveAttribute('href', '/en/apartment?m=2026-10#living');
  });

  it('follows later hash changes', async () => {
    render(<LanguageSwitch locale="en" label="Language" />);
    window.history.replaceState(null, '', '/en/apartment?m=2026-10#kitchen');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('link', { name: 'Ελληνικά' })).toHaveAttribute('href', '/el/apartment?m=2026-10#kitchen');
  });
});
