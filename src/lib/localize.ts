import type { Locale } from '@/i18n/config';

/**
 * Resolves a localized string field: `${baseKey}_${locale}`, then `baseKey`, then `${baseKey}_en`.
 * Whitespace-only strings count as missing. Pure (no node:fs), so client-side modules can use it.
 */
export function pickLocale(obj: object, baseKey: string, locale: Locale): string | undefined {
  const record = obj as Record<string, unknown>;
  for (const key of [`${baseKey}_${locale}`, baseKey, `${baseKey}_en`]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}
