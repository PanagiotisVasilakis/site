import { ApiErrorCode } from '@/lib/apiErrorTypes';

type UIError = {
  summary: string;
  details?: string[];
  fields?: Record<string, string>;
  code?: string;
};

type ErrLocale = 'en' | 'el';

const messages = {
  en: {
    generic: 'Something went wrong. Please try again.',
    invalidValue: 'Invalid value',
    validation: 'Please fix the highlighted fields and try again.',
    unauthorized: "We couldn't verify your identity. Check your details and try again.",
    notFound: 'We could not find a matching record. Double‑check your information.',
    rateLimited: 'Too many attempts. Please wait a minute and try again.',
    payloadTooLarge: 'The submitted data was too large. Please reduce the size and try again.',
    forbidden: "You don't have permission to do that.",
    conflict: 'This action cannot be completed due to a conflict. Try again or contact support.',
    unavailable: 'The service is temporarily unavailable. Please try again later.',
  },
  el: {
    generic: 'Κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά.',
    invalidValue: 'Μη έγκυρη τιμή',
    validation: 'Παρακαλώ διορθώστε τα επισημασμένα πεδία και δοκιμάστε ξανά.',
    unauthorized: 'Δεν μπορέσαμε να επαληθεύσουμε την ταυτότητά σας. Ελέγξτε τα στοιχεία σας και δοκιμάστε ξανά.',
    notFound: 'Δεν βρέθηκε αντίστοιχη εγγραφή. Ελέγξτε ξανά τα στοιχεία σας.',
    rateLimited: 'Πάρα πολλές προσπάθειες. Παρακαλώ περιμένετε ένα λεπτό και δοκιμάστε ξανά.',
    payloadTooLarge: 'Τα δεδομένα που υποβλήθηκαν ήταν πολύ μεγάλα. Μειώστε το μέγεθος και δοκιμάστε ξανά.',
    forbidden: 'Δεν έχετε δικαίωμα να το κάνετε αυτό.',
    conflict: 'Η ενέργεια δεν μπορεί να ολοκληρωθεί λόγω διένεξης. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας.',
    unavailable: 'Η υπηρεσία είναι προσωρινά μη διαθέσιμη. Παρακαλώ δοκιμάστε ξανά αργότερα.',
  },
} as const;

export function mapApiErrorToUI(err: unknown, locale: ErrLocale = 'en'): UIError {
  const m = messages[locale] ?? messages.en;
  try {
    const fallback: UIError = { summary: m.generic };
    if (!err || typeof err !== 'object') return fallback;
    const e = err as { error?: { code?: string; message?: string; details?: unknown } };
    const code = e.error?.code as ApiErrorCode | undefined;
    const detailsRaw = e.error?.details as
      | {
          validationErrors?: Array<{ path?: string; message?: string }>;
          fields?: Record<string, unknown>;
          hints?: string[];
        }
      | undefined;

    const fieldMap: Record<string, string> | undefined = (() => {
      if (!detailsRaw?.fields || typeof detailsRaw.fields !== 'object') return undefined;
      const entries = Object.entries(detailsRaw.fields).filter(([, value]) => typeof value === 'string');
      if (entries.length === 0) return undefined;
      return Object.fromEntries(entries) as Record<string, string>;
    })();

    const fieldList = fieldMap ? entriesToMessages(fieldMap) : detailsRaw?.hints;

    const details = detailsRaw as unknown as { validationErrors?: Array<{ path?: string; message?: string }> } | undefined;

    switch (code) {
      case ApiErrorCode.VALIDATION_ERROR: {
        const fields: Record<string, string> = {};
        const list: string[] = [];
  const issues: Array<{ path?: string; message?: string }> = details?.validationErrors || [];
        for (const i of issues) {
          if (i?.path) fields[i.path] = i.message || m.invalidValue;
          if (i?.message) list.push(i.message);
        }
        return { summary: m.validation, details: list.slice(0, 5), fields, code };
      }
      case ApiErrorCode.UNAUTHORIZED:
        return {
          summary: m.unauthorized,
          code,
          fields: fieldMap,
          details: fieldList,
        };
      case ApiErrorCode.NOT_FOUND:
        return { summary: m.notFound, code };
      case ApiErrorCode.RATE_LIMITED:
        return { summary: m.rateLimited, code };
      case ApiErrorCode.PAYLOAD_TOO_LARGE:
        return { summary: m.payloadTooLarge, code };
      case ApiErrorCode.FORBIDDEN:
        return { summary: m.forbidden, code };
      case ApiErrorCode.CONFLICT:
        return { summary: m.conflict, code };
      case ApiErrorCode.SERVICE_UNAVAILABLE:
      case ApiErrorCode.GATEWAY_TIMEOUT:
      case ApiErrorCode.EXTERNAL_SERVICE_ERROR:
        return { summary: m.unavailable, code };
      case ApiErrorCode.INTERNAL_ERROR:
      default:
        return { summary: m.generic, code };
    }
  } catch {
    return { summary: m.generic };
  }
}

function entriesToMessages(fields: Record<string, string>): string[] {
  return Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
}
