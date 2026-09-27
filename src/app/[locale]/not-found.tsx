"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

// Rendered inside the locale layout for notFound() and unknown paths.
export default function LocaleNotFound() {
  const pathname = usePathname();
  const locale: Locale = pathname?.startsWith('/el') ? 'el' : 'en';
  const t = getDictionary(locale);
  return (
    <div className="min-h-[60svh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-serif italic font-bold page-title">{t.errors.notFoundTitle}</h1>
        <p className="text-sm text-body">{t.errors.notFoundBody}</p>
        <Link href={`/${locale}`} className="btn btn-primary min-h-11 inline-flex px-6">{t.cta.home}</Link>
      </div>
    </div>
  );
}
