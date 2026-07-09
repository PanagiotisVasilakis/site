"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logger } from '@/lib/logger-client';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const locale: Locale = pathname?.startsWith('/el') ? 'el' : 'en';
  const t = getDictionary(locale);
  useEffect(() => {
    logger.error('Unhandled UI error (locale segment)', { message: error.message, stack: error.stack, digest: error.digest });
  }, [error]);
  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-serif italic font-bold">{t.errors?.somethingWentWrong ?? 'Something went wrong'}</h1>
        <p className="text-sm opacity-80">{t.errors?.unexpectedError ?? 'An unexpected error occurred. You can try to recover.'}</p>
        <button className="btn-tint" onClick={() => reset()}>{t.errors?.tryAgain ?? 'Try again'}</button>
      </div>
    </div>
  );
}


