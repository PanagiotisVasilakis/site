export const locales = ["en", "el"] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "en";

/** Whether a value is one of the supported locales. */
export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}

/** The locale a pathname starts with (`/el` or `/el/...`), if any. */
export function pathLocale(pathname: string): Locale | undefined {
  return locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
}

/** A supported locale, or the default for anything else (missing, unknown, malformed). */
export function normalizeLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}
