import type { Metadata } from 'next';

import { type Locale } from '@/i18n/config';

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
