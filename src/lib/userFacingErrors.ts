import { ApiErrorCode } from '@/lib/apiErrorHandler';

export type UIError = {
  summary: string;
  details?: string[];
  fields?: Record<string, string>;
  code?: string;
};

export function mapApiErrorToUI(err: unknown): UIError {
  try {
    const fallback: UIError = { summary: 'Something went wrong. Please try again.' };
    if (!err || typeof err !== 'object') return fallback;
  const e = err as { error?: { code?: string; message?: string; details?: unknown } };
    const code = e.error?.code as ApiErrorCode | undefined;
  const details = e.error?.details as unknown as { validationErrors?: Array<{ path?: string; message?: string }> } | undefined;

    switch (code) {
      case ApiErrorCode.VALIDATION_ERROR: {
        const fields: Record<string, string> = {};
        const list: string[] = [];
  const issues: Array<{ path?: string; message?: string }> = details?.validationErrors || [];
        for (const i of issues) {
          if (i?.path) fields[i.path] = i.message || 'Invalid value';
          if (i?.message) list.push(i.message);
        }
        return { summary: 'Please fix the highlighted fields and try again.', details: list.slice(0, 5), fields, code };
      }
      case ApiErrorCode.UNAUTHORIZED:
        return { summary: "We couldn't verify your identity. Check your details and try again.", code };
      case ApiErrorCode.NOT_FOUND:
        return { summary: 'We could not find a matching record. Double‑check your information.', code };
      case ApiErrorCode.RATE_LIMITED:
        return { summary: 'Too many attempts. Please wait a minute and try again.', code };
      case ApiErrorCode.PAYLOAD_TOO_LARGE:
        return { summary: 'The submitted data was too large. Please reduce the size and try again.', code };
      case ApiErrorCode.FORBIDDEN:
        return { summary: "You don't have permission to do that.", code };
      case ApiErrorCode.CONFLICT:
        return { summary: 'This action cannot be completed due to a conflict. Try again or contact support.', code };
      case ApiErrorCode.SERVICE_UNAVAILABLE:
      case ApiErrorCode.GATEWAY_TIMEOUT:
      case ApiErrorCode.EXTERNAL_SERVICE_ERROR:
        return { summary: 'The service is temporarily unavailable. Please try again later.', code };
      case ApiErrorCode.INTERNAL_ERROR:
      default:
        return { summary: 'Something went wrong. Please try again.', code };
    }
  } catch {
    return { summary: 'Something went wrong. Please try again.' };
  }
}
