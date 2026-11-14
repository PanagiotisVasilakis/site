import type { Locale } from '@/i18n/config';
import { whatsappHref } from '@/lib/whatsapp';

const HOST_PHONE = '+30 695 581 0051';

/**
 * Host contact details: the single place to change them. WhatsApp is the host phone's chat.
 * legalName, address and registrationNumber (ΑΜΑ) are the host identity: the footer and the apartment and
 * availability heads show them (HostIdentity), and the privacy page lists the controller from them.
 */
export const HOST_CONTACT = {
  phone: HOST_PHONE,
  email: 'dolcefarnienteapartments@gmail.com',
  whatsapp: whatsappHref(HOST_PHONE),
  instagram: 'https://www.instagram.com/dolcefarniente_kalamata',
  /** The host's name (ονοματεπώνυμο), supplied by the owner on 2026-10-15: Greek and Latin spelling in one string, shown the same on /en and /el. The owner typed it without accents; the accented Greek spelling is used. The operator is a private individual and "Dolce Far Niente" is only the brand; π.δ. 131/2003 art. 4 requires the name and the geographic address. */
  legalName: 'Παναγιώτης Βασιλάκης / Panagiotis Vasilakis',
  address: 'Αρχιμήδους 21, 241 00 Καλαμάτα, Greece',
  /** ΑΜΑ (Αριθμός Μητρώου Ακινήτου), supplied by the owner on 2026-10-14. A string: the leading zeros are part of the number. Display duty: ΠΟΛ 1187/2017 art. 1(5)(β), fine art. 4(3); showing it on every page is the owner's choice. */
  registrationNumber: '00003515821',
  // ΑΦΜ and ΓΕΜΗ are deliberately NOT shown (owner decision of 2026-10-14: the operator is a private individual and only the necessary information is public).
} as const;

/**
 * The host letter's owner fields (identity §1.4, §13 item 2), supplied by the owner. Each one that is
 * empty is left out of the letter: no placeholder is ever shown. `name` stays '' on purpose (owner
 * decision of 2026-10-20): the hostess who writes the letter is not named anywhere on the site, and
 * the feminine host texts are intended.
 */
export const HOST_PROFILE: Readonly<{
  name: string;
  languages: Readonly<Record<Locale, string>>;
  replyTime: Readonly<Record<Locale, string>>;
}> = {
  name: '',
  languages: { en: '', el: '' },
  replyTime: { en: '', el: '' },
};

/**
 * The public Booking.com listing link (a Share link), shown only while isBookingComListingUrl
 * (src/lib/contactLinks.ts) passes. It is public data, not a secret, and no stay dates are
 * appended to it.
 */
// TODO (owner): confirm that this Share link is the one to publish. Only a https://www.booking.com/Share-<token> link (or the same on booking.com) passes isBookingComListingUrl; a canonical property URL also needs a change of that function and of tests/unit/contact-links.test.ts, otherwise the Booking.com button disappears from the home, apartment and availability pages. No stay dates are appended: Booking.com date parameters are unverified. This is a public link; never put it into BOOKING_ICAL_URL, which is a different, secret URL.
export const BOOKING_COM_LISTING_URL: string = 'https://www.booking.com/Share-AiCapK';
