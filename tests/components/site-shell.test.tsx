// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// The header's wiring only: the hook itself is covered in pointer-effects.test.tsx.
vi.mock('@/lib/motion/pointerEffects', () => ({ usePointerEffects: pointerEffects }));

import { ToastProvider } from '@/components/Toast';
import SiteHeader from '@/components/shell/SiteHeader';
import SiteFooter from '@/components/shell/SiteFooter';
import LanguageSwitch from '@/components/shell/LanguageSwitch';
import { getDictionary } from '@/i18n/dictionaries';
import { HOST_CONTACT } from '@/data/contact';

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

// jsdom has no Element.scrollIntoView; the mock records which element was scrolled to (mock.contexts).
function installScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  return scrollIntoView;
}

// Clicks an element and reports whether a click handler prevented the default action. The listener on the
// document runs after React's handlers; it also stops jsdom from trying to navigate (it cannot).
function clickPrevented(element: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false;
  const record = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', record, { once: true });
  fireEvent.click(element, init);
  document.removeEventListener('click', record);
  return prevented;
}

const BOOKING_HREF = /\/availability|booking\.com/i;
// The header pushes a toast when a sign-out fails, so it renders inside the same provider as the locale layout.
const inToasts = { wrapper: ToastProvider };
// Design Q6 (decision D13): the exact toast copy of a failed sign-out.
const FAILED_SIGN_OUT = {
  en: "We couldn't sign you out. Try again.",
  el: 'Δεν ήταν δυνατή η αποσύνδεση. Δοκιμάστε ξανά.',
} as const;

describe('site shell', () => {
  let dialog: ReturnType<typeof installDialog>;
  let scrollIntoView: ReturnType<typeof installScrollIntoView>;

  beforeEach(() => {
    navigation.pathname = '/en';
    navigation.search = '';
    session.isSignedIn = false;
    session.portalEnabled = true;
    session.checkinEnabled = true;
    dialog = installDialog();
    scrollIntoView = installScrollIntoView();
    installMatchMedia(false);
    window.history.replaceState(null, '', '/en');
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('opens the menu as a modal dialog, closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    render(<SiteHeader locale="en" />, inToasts);
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
    render(<SiteHeader locale="en" />, inToasts);
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
    const { container } = render(<SiteHeader locale="en" />, inToasts);
    expect(container.querySelector('.site-header__progress')).toHaveAttribute('aria-hidden', 'true');
    expect(pointerEffects).toHaveBeenCalledWith(true);
    const nav = screen.getAllByRole('navigation', { name: 'Primary navigation' })[0];
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/en/apartment', '/en/availability', '/en/moments', '/en#contact', '/en/stay',
    ]);
    expect(screen.getByRole('link', { name: 'Check dates' })).toHaveAttribute('href', '/en/availability');
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: /Call/, hidden: true })).toHaveAttribute('href', 'tel:+306955810051');
    expect(within(menu).getByRole('link', { name: /WhatsApp/, hidden: true })).toHaveAttribute('href', 'https://wa.me/306955810051');
    expect(within(menu).getByRole('link', { name: 'Your stay', hidden: true })).toHaveAttribute('href', '/en/stay');
  });

  it('marks the current page with aria-current', () => {
    navigation.pathname = '/el/apartment';
    render(<SiteHeader locale="el" />, inToasts);
    const nav = screen.getAllByRole('navigation', { name: 'Κύρια πλοήγηση' })[0];
    expect(within(nav).getByRole('link', { name: 'Διαμέρισμα' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Διαθεσιμότητα' })).not.toHaveAttribute('aria-current');
  });

  it.each(['/en/stay', '/el/offline', '/en/guest', '/en/check-in', '/el/portal/refresh'])(
    'renders no booking, availability or Booking.com link in the stay header, menu and footer (%s)',
    (pathname) => {
      navigation.pathname = pathname;
      const locale = pathname.slice(1, 3);
      const { container } = render(<><SiteHeader locale={locale} /><SiteFooter locale={locale} /></>, inToasts);
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
    render(<SiteHeader locale="en" />, inToasts);
    const brand = screen.getByRole('link', { name: /Dolce Far Niente/ });
    // jsdom has no AnimationEvent: a plain bubbling event carrying the animation name.
    const end = (animationName: string) => fireEvent(brand, Object.assign(new Event('animationend', { bubbles: true }), { animationName }));
    end('brand-waves-draw');
    expect(document.documentElement).toHaveAttribute('data-intro');
    end('brand-sun-rise');
    expect(document.documentElement).not.toHaveAttribute('data-intro');
  });

  it('offers sign-in, and no check-in link, to a signed-out visitor', () => {
    render(<SiteHeader locale="en" />, inToasts);
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: 'Sign in', hidden: true })).toHaveAttribute('href', '/en/guest?mode=signin');
    expect(within(menu).queryByRole('link', { name: /Check-in/i, hidden: true })).toBeNull();
  });

  it('offers sign-out to a signed-in guest in the menu', async () => {
    session.isSignedIn = true;
    session.signOut.mockResolvedValue(true);
    const user = userEvent.setup();
    navigation.pathname = '/en/check-in';
    render(<SiteHeader locale="en" />, inToasts);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: /Check-in/i })).toHaveAttribute('href', '/en/check-in');
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(session.signOut).toHaveBeenCalledTimes(1);
    // A successful sign-out leaves the portal pages for the home page and refreshes the server data.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(FAILED_SIGN_OUT.en)).toBeNull();
    expect(menu).not.toHaveAttribute('open');
  });

  it('closes the menu, stays put and says so when the menu sign-out fails (R-690)', async () => {
    session.isSignedIn = true;
    session.signOut.mockResolvedValue(false);
    const user = userEvent.setup();
    navigation.pathname = '/en/check-in';
    render(<SiteHeader locale="en" />, inToasts);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(FAILED_SIGN_OUT.en)).toBeInTheDocument();
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(menu).not.toHaveAttribute('open');
  });

  it('offers no account link in the menu while the portal is off (its pages answer 404)', () => {
    session.portalEnabled = false;
    session.checkinEnabled = false;
    const { container } = render(<SiteHeader locale="en" />, inToasts);
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).queryByRole('link', { name: 'Sign in', hidden: true })).toBeNull();
    expect(within(menu).queryByRole('link', { name: /Check-in/i, hidden: true })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Sign out', hidden: true })).toBeNull();
    expect(container.querySelector('.mobile-menu__account')).toBeNull();
    // The rest of the menu is still there.
    expect(within(menu).getByRole('link', { name: /Call/, hidden: true })).toHaveAttribute('href', 'tel:+306955810051');
  });

  it('keeps sign-in for a signed-out visitor while only check-in is off', () => {
    session.checkinEnabled = false;
    render(<SiteHeader locale="en" />, inToasts);
    const menu = screen.getByRole('dialog', { hidden: true });
    expect(within(menu).getByRole('link', { name: 'Sign in', hidden: true })).toHaveAttribute('href', '/en/guest?mode=signin');
    expect(within(menu).queryByRole('link', { name: /Check-in/i, hidden: true })).toBeNull();
  });

  it('offers sign-out, and no check-in link, to a signed-in guest while check-in is off (its page answers 404)', async () => {
    session.isSignedIn = true;
    session.checkinEnabled = false;
    session.signOut.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SiteHeader locale="en" />, inToasts);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).queryByRole('link', { name: /Check-in/i })).toBeNull();
    expect(within(menu).queryByRole('link', { name: 'Sign in' })).toBeNull();
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out from the stay header button and goes home on success', async () => {
    session.isSignedIn = true;
    session.signOut.mockResolvedValue(true);
    const user = userEvent.setup();
    navigation.pathname = '/en/stay';
    render(<SiteHeader locale="en" />, inToasts);
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button.closest('header')).not.toBeNull();
    await user.click(button);
    expect(session.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(FAILED_SIGN_OUT.en)).toBeNull();
  });

  it.each([
    ['en', '/en/stay', 'Sign out'],
    ['el', '/el/stay', 'Αποσύνδεση'],
  ] as const)('keeps the guest on the %s page and shows the failure toast when the stay header sign-out fails (R-690)', async (locale, pathname, label) => {
    session.isSignedIn = true;
    session.signOut.mockResolvedValue(false);
    const user = userEvent.setup();
    navigation.pathname = pathname;
    render(<SiteHeader locale={locale} />, inToasts);
    await user.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByText(FAILED_SIGN_OUT[locale])).toBeInTheDocument();
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    // Still signed in, so the button is still offered for another try.
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('renders the marketing footer with contact rows and the "Your stay" link', () => {
    render(<SiteFooter locale="en" />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /Staying with us now\? Your stay/ })).toHaveAttribute('href', '/en/stay');
    // The header nav now ends with "Your stay"; the footer must not repeat it in its own nav.
    expect(within(footer).getAllByRole('link').filter((link) => link.getAttribute('href') === '/en/stay')).toHaveLength(1);
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

  it.each([
    ['en', '/en'],
  ] as const)('shows the tagline and the location line under the brand in the %s marketing footer (%s)', (locale, pathname) => {
    navigation.pathname = pathname;
    render(<SiteFooter locale={locale} />);
    const footer = screen.getByRole('contentinfo');
    const { heroTagline, heroFacts } = getDictionary(locale).home;
    expect(within(footer).getByText(heroTagline)).toHaveClass('site-footer__tagline');
    expect(within(footer).getByText(heroFacts)).toHaveClass('site-footer__place');
  });

  // R-689 (decision D13): next/link scrolls only when the hash changes, so "Contact" at an URL that already ends in
  // #contact did nothing. The nav links then scroll to the target themselves. Next's own navigation is not under
  // test (no router here): the first click is "not prevented by our handler", the second is "prevented and scrolled".
  it('scrolls to the footer contact block when the header "Contact" is clicked at /en#contact, and leaves the first click to Next (R-689)', () => {
    render(<><SiteHeader locale="en" /><SiteFooter locale="en" /></>, inToasts);
    const nav = screen.getAllByRole('navigation', { name: 'Primary navigation' })[0];
    const contact = within(nav).getByRole('link', { name: 'Contact' });

    expect(clickPrevented(contact)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();

    window.history.pushState(null, '', '/en#contact'); // what Next's first navigation leaves behind
    expect(clickPrevented(contact)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('contact'));
  });

  it('closes the menu and scrolls on a second menu "Contact" click, and only closes it on the first (R-689)', async () => {
    const user = userEvent.setup();
    render(<><SiteHeader locale="en" /><SiteFooter locale="en" /></>, inToasts);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    const menu = screen.getByRole('dialog', { hidden: true });

    await user.click(trigger);
    expect(menu).toHaveAttribute('open');
    expect(clickPrevented(within(menu).getByRole('link', { name: 'Contact' }))).toBe(false);
    expect(menu).not.toHaveAttribute('open');
    expect(scrollIntoView).not.toHaveBeenCalled();

    window.history.pushState(null, '', '/en#contact');
    await user.click(trigger);
    expect(menu).toHaveAttribute('open');
    expect(clickPrevented(within(menu).getByRole('link', { name: 'Contact' }))).toBe(true);
    expect(menu).not.toHaveAttribute('open');
    expect(scrollIntoView.mock.contexts).toEqual([document.getElementById('contact')]);

    // Another menu link at the same URL: closes the menu, neither prevented nor scrolled.
    await user.click(trigger);
    expect(clickPrevented(within(menu).getByRole('link', { name: 'Apartment' }))).toBe(false);
    expect(menu).not.toHaveAttribute('open');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrolls on a second footer "Contact" click at /en#contact and leaves the first and the other footer links alone (R-689)', () => {
    const { container } = render(<SiteFooter locale="en" />);
    const footer = screen.getByRole('contentinfo');
    const contact = within(footer).getByRole('link', { name: 'Contact' });

    expect(clickPrevented(contact)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();

    window.history.pushState(null, '', '/en#contact');
    expect(clickPrevented(within(footer).getByRole('link', { name: 'Apartment' }))).toBe(false);
    expect(clickPrevented(within(footer).getByRole('link', { name: /Your stay/ }))).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(clickPrevented(contact)).toBe(true);
    expect(scrollIntoView.mock.contexts).toEqual([container.querySelector('#contact')]);
  });

  it('makes the home footer contact block the #contact target, with phone, e-mail, Instagram and WhatsApp', () => {
    const { container } = render(<SiteFooter locale="en" />);
    const target = container.querySelector('#contact') as HTMLElement;
    expect(target).toHaveClass('site-footer__contact');
    expect(within(target).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'tel:+306955810051',
      'mailto:dolcefarnienteapartments@gmail.com',
      'https://www.instagram.com/dolcefarniente_kalamata',
      'https://wa.me/306955810051',
    ]);
  });

  it.each(['/en/availability'])('leaves the #contact id out of the footer on %s (the availability page has its own)', (pathname) => {
    navigation.pathname = pathname;
    const { container } = render(<SiteFooter locale={pathname.slice(1, 3)} />);
    expect(container.querySelector('.site-footer__contact')).not.toBeNull();
    expect(container.querySelector('#contact')).toBeNull();
  });

  it.each(['/en/stay'])('keeps the stay footer slim: no tagline, location line or #contact (%s)', (pathname) => {
    navigation.pathname = pathname;
    const { container } = render(<SiteFooter locale={pathname.slice(1, 3)} />);
    expect(container.querySelector('.site-footer__tagline, .site-footer__place, #contact')).toBeNull();
  });

  it.each([['/en', 'en'], ['/el/guest', 'el']] as const)(
    'shows the host identity as text only in the footer, marketing and stay (%s)',
    (pathname, locale) => {
      navigation.pathname = pathname;
      render(<SiteFooter locale={locale} />);
      const identity = screen.getByRole('contentinfo').querySelector('.host-identity') as HTMLElement;
      expect(identity).not.toBeNull();
      const labels = getDictionary(locale).shell.identity;
      for (const text of [labels.registryLabel, labels.legalNameLabel, labels.addressLabel, '00003515821', HOST_CONTACT.legalName, HOST_CONTACT.address]) {
        expect(within(identity).getByText(text)).toBeInTheDocument();
      }
      expect(within(identity).queryByRole('link')).toBeNull();
    },
  );
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
