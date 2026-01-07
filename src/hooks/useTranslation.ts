import { useMemo } from 'react';
import { getDictionary, type Dictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

/**
 * A hook for accessing translations in client components.
 * Provides memoized access to the dictionary and common locale helpers.
 * 
 * @param locale - The current locale string
 * @returns Translation utilities and dictionary
 * 
 * @example
 * ```tsx
 * const { t, isGreek } = useTranslation(locale);
 * return <h1>{t.contact?.title}</h1>;
 * ```
 */
export function useTranslation(locale: string) {
    const safeLocale = (locale === 'el' ? 'el' : 'en') as Locale;

    const t = useMemo(() => getDictionary(safeLocale), [safeLocale]);

    return {
        /** The full dictionary for the current locale */
        t,
        /** Current locale code */
        locale: safeLocale,
        /** Whether the current locale is Greek */
        isGreek: safeLocale === 'el',
        /** Whether the current locale is English */
        isEnglish: safeLocale === 'en',
    };
}

/**
 * Type helper for extracting specific sections from Dictionary
 */
export type TranslationSection<K extends keyof Dictionary> = NonNullable<Dictionary[K]>;
