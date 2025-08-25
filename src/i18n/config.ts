export const locales = ["en", "el"] as const; // Arabic removed
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "en";
