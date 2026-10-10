"use client";

import Link from 'next/link';
import { useEffect, useId, useRef, type RefObject } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { Dictionary } from '@/i18n/dictionaries';
import LanguageSwitch from './LanguageSwitch';
import { MotionSwitch } from './MotionSwitch';
import { ThemeSetting } from './ThemeSwitch';
import { isCurrentLink, menuContactLinks, navLinks, type ShellVariant } from './shellLinks';

const CONTACT_ICONS: Record<string, IconName> = { call: 'phone', whatsapp: 'message' };

interface MobileMenuProps {
  id: string;
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  locale: string;
  pathname: string;
  variant: ShellVariant;
  t: Dictionary;
  isSignedIn: boolean;
  portalEnabled: boolean;
  checkinEnabled: boolean;
  onSignOut: () => void;
}

/**
 * identity §8 MobileMenu: a modal <dialog> (showModal: the browser traps focus and makes the page inert),
 * a sheet from the right. Escape and a backdrop click close it; focus returns to the menu button.
 * Page scroll is locked by `:root:has(.mobile-menu[open])` in shell.css. The account links follow the feature
 * flags, because the guest and check-in pages answer 404 while their flag is off: no account block without the
 * portal, no check-in link without check-in. Sign out does not depend on the check-in flag.
 */
export default function MobileMenu({
  id, open, onClose, triggerRef, locale, pathname, variant, t, isSignedIn, portalEnabled, checkinEnabled, onSignOut,
}: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => dialogRef.current?.close();
  const contactLinks = menuContactLinks(variant, t);

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="mobile-menu"
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        triggerRef.current?.focus();
      }}
      onClick={(event) => {
        // A click on the ::backdrop targets the dialog itself; the sheet fills the whole dialog box.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="mobile-menu__sheet">
        <div className="mobile-menu__head">
          <p id={titleId} className="mobile-menu__title">{t.shell.menuTitle}</p>
          <IconButton label={t.ui.closeMenu} onClick={close}>
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        <nav className="mobile-menu__nav" aria-label={t.ui.primaryNavigation}>
          {navLinks(variant, locale, t).map((link) => {
            const current = isCurrentLink(pathname, link.href);
            return (
              <Link
                key={link.key}
                href={link.href}
                className="mobile-menu__link shell-link"
                aria-current={current ? 'page' : undefined}
                onClick={close}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {contactLinks.length > 0 && (
          <div className="mobile-menu__contact">
            {contactLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="ui-btn ui-btn--secondary ui-btn--md shell-link"
                {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <Icon name={CONTACT_ICONS[link.key] ?? 'phone'} size={20} />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {portalEnabled && (
          <div className="mobile-menu__account">
            {isSignedIn ? (
              <>
                {checkinEnabled && (
                  <Link href={`/${locale}/check-in`} className="mobile-menu__account-link shell-link" onClick={close}>
                    <Icon name="key" size={20} />
                    {t.checkin.navLabel}
                  </Link>
                )}
                <button
                  type="button"
                  className="mobile-menu__account-link"
                  onClick={() => {
                    close();
                    onSignOut();
                  }}
                >
                  <Icon name="user" size={20} />
                  {t.ui.signOut}
                </button>
              </>
            ) : (
              <Link href={`/${locale}/guest?mode=signin`} className="mobile-menu__account-link shell-link" onClick={close}>
                <Icon name="user" size={20} />
                {t.ui.signIn}
              </Link>
            )}
          </div>
        )}

        <div className="mobile-menu__prefs">
          <LanguageSwitch locale={locale} label={t.shell.language} />
          <ThemeSetting t={t.shell} />
          <MotionSwitch t={t.shell} />
        </div>
      </div>
    </dialog>
  );
}
