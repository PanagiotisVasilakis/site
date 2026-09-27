export const locales = ["en", "el"] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "en";

/** A supported locale, or the default for anything else (missing, unknown, malformed). */
export function normalizeLocale(value: string | null | undefined): Locale {
  return value && (locales as readonly string[]).includes(value) ? value as Locale : defaultLocale;
}
