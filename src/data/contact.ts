import type { Locale } from '@/i18n/config';
import { whatsappHref } from '@/lib/whatsapp';

const HOST_PHONE = '+30 695 581 0051';

/** Host contact details: the single place to change them. WhatsApp is the host phone's chat. */
export const HOST_CONTACT = {
  phone: HOST_PHONE,
  email: 'dolcefarnienteapartments@gmail.com',
  whatsapp: whatsappHref(HOST_PHONE),
  instagram: 'https://www.instagram.com/dolcefarniente_kalamata',
} as const;

/**
 * The host letter's owner fields (identity §1.4, §13 item 2), supplied by the owner. Each one that is
 * empty is left out of the letter: no placeholder is ever shown.
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
 * The public Airbnb listing (https://www.airbnb.com/rooms/<id> or airbnb.gr), supplied by the
 * owner (task R3-L1). While it is empty or not an Airbnb listing URL, no "Book on Airbnb"
 * button is rendered (isAirbnbListingUrl in src/lib/contactLinks.ts).
 */
export const AIRBNB_LISTING_URL: string = '';

/**
 * Airbnb documents no deep-link parameters for dates, so the listing link carries no dates
 * until someone verifies them against the live site and sets this to true.
 */
export const AIRBNB_DATE_PARAMS_VERIFIED: boolean = false;
