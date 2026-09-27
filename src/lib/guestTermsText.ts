import type { Locale } from '@/i18n/config';

/**
 * The exact claim-time terms text shown to guests. Client-safe (no crypto):
 * the sign-up form renders it, and src/lib/guestTerms.ts hashes the same
 * document for the stored TermsAcceptance. Changing any text requires a new
 * version.
 */
export const GUEST_TERMS_VERSION = '2026-09-24';

export const GUEST_TERMS_TEXT: Readonly<Record<Locale, string>> = Object.freeze({
  en: 'I confirm my details are correct and accept the portal terms and data processing needed to provide my stay.',
  el: 'Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και αποδέχομαι τους όρους χρήσης και την επεξεργασία δεδομένων για την παροχή της διαμονής.',
});
