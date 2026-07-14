import type { Metadata } from 'next';

import { locales, type Locale } from '@/i18n/config';

export function normalizeLocale(locale: string): Locale {
  return (locales as readonly string[]).includes(locale) ? locale as Locale : 'en';
}

export function localizedAlternates(locale: Locale, suffix = ''): NonNullable<Metadata['alternates']> {
  const normalizedSuffix = suffix && !suffix.startsWith('/') ? `/${suffix}` : suffix;
  return {
    canonical: `/${locale}${normalizedSuffix}`,
    languages: {
      en: `/en${normalizedSuffix}`,
      el: `/el${normalizedSuffix}`,
      'x-default': `/en${normalizedSuffix}`,
    },
  };
}
