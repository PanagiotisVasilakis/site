import { normalizePhone } from '@/lib/phone';

// The property is in Greece. Unprefixed local numbers are therefore interpreted
// as Greek; international guests must provide an explicit country prefix.
export function normalizeStayRequestPhone(value: string): string | null {
  return normalizePhone(value, 'GR')?.e164 ?? null;
}
