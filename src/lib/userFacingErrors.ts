import type { Locale } from '@/i18n/config';
import { ApiErrorCode } from '@/lib/apiErrorTypes';

type UIError = {
  summary: string;
  details?: string[];
};

const messages = {
  en: {
    generic: 'Something went wrong. Please try again.',
    validation: 'Please fix the highlighted fields and try again.',
    unauthorized: "We couldn't verify your identity. Check your details and try again.",
    notFound: 'We could not find a matching record. Double‑check your information.',
    rateLimited: 'Too many attempts. Please wait up to an hour and try again.',
    payloadTooLarge: 'The submitted data was too large. Please reduce the size and try again.',
    forbidden: "You don't have permission to do that.",
    conflict: 'This action cannot be completed due to a conflict. Try again or contact support.',
    unavailable: 'The service is temporarily unavailable. Please try again later.',
  },
  el: {
    generic: 'Κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά.',
    validation: 'Παρακαλώ διορθώστε τα επισημασμένα πεδία και δοκιμάστε ξανά.',
    unauthorized: 'Δεν μπορέσαμε να επαληθεύσουμε την ταυτότητά σας. Ελέγξτε τα στοιχεία σας και δοκιμάστε ξανά.',
    notFound: 'Δεν βρέθηκε αντίστοιχη εγγραφή. Ελέγξτε ξανά τα στοιχεία σας.',
    rateLimited: 'Πάρα πολλές προσπάθειες. Περιμένετε έως μία ώρα και δοκιμάστε ξανά.',
    payloadTooLarge: 'Τα δεδομένα που υποβλήθηκαν ήταν πολύ μεγάλα. Μειώστε το μέγεθος και δοκιμάστε ξανά.',
    forbidden: 'Δεν έχετε δικαίωμα να το κάνετε αυτό.',
    conflict: 'Η ενέργεια δεν μπορεί να ολοκληρωθεί λόγω διένεξης. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας.',
    unavailable: 'Η υπηρεσία είναι προσωρινά μη διαθέσιμη. Παρακαλώ δοκιμάστε ξανά αργότερα.',
  },
} as const;

type MessageKey = keyof typeof messages.en;

// Codes absent from this table get the generic summary. A Map, not an object literal,
// so an attacker-supplied code such as "constructor" cannot resolve to an Object.prototype member.
const SUMMARY_KEY_BY_CODE = new Map<string, MessageKey>([
  [ApiErrorCode.UNAUTHORIZED, 'unauthorized'],
  [ApiErrorCode.NOT_FOUND, 'notFound'],
  [ApiErrorCode.RATE_LIMITED, 'rateLimited'],
  [ApiErrorCode.PAYLOAD_TOO_LARGE, 'payloadTooLarge'],
  [ApiErrorCode.FORBIDDEN, 'forbidden'],
  [ApiErrorCode.CONFLICT, 'conflict'],
  [ApiErrorCode.SERVICE_UNAVAILABLE, 'unavailable'],
  [ApiErrorCode.GATEWAY_TIMEOUT, 'unavailable'],
  [ApiErrorCode.EXTERNAL_SERVICE_ERROR, 'unavailable'],
]);

export function mapApiErrorToUI(err: unknown, locale: Locale = 'en'): UIError {
  const m = messages[locale];
  try {
    if (!err || typeof err !== 'object') return { summary: m.generic };
    const e = err as { error?: { code?: string; details?: unknown } };
    const code = e.error?.code ?? '';

    if (code === ApiErrorCode.VALIDATION_ERROR) {
      const detailsRaw = e.error?.details as { validationErrors?: Array<{ message?: string }> } | undefined;
      const list = (detailsRaw?.validationErrors || []).flatMap((i) => (i?.message ? [i.message] : []));
      return { summary: m.validation, details: list.slice(0, 5) };
    }

    return { summary: m[SUMMARY_KEY_BY_CODE.get(code) ?? 'generic'] };
  } catch {
    return { summary: m.generic };
  }
}
