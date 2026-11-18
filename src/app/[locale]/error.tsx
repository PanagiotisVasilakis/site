"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logger } from '@/lib/logger-client';
import { errorReporter } from '@/lib/errorReporting';
import { getDictionary } from '@/i18n/dictionaries';
import { defaultLocale, pathLocale } from '@/i18n/config';
import { Button } from '@/components/ui/Button';
import { StatusLinks, StatusPage } from '@/components/stay/StatusPage';

// identity §9.10: the 404 layout with "Try again" (retry) and a Home link; no technical details.
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname();
  const locale = (pathname ? pathLocale(pathname) : null) ?? defaultLocale;
  const t = getDictionary(locale);
  useEffect(() => {
    logger.error('Unhandled UI error (locale segment)', { message: error.message, stack: error.stack, digest: error.digest });
    void errorReporter.reportError(error, { category: 'localeError' });
  }, [error]);
  return (
    <StatusPage title={t.errors.somethingWentWrong} lead={t.errors.unexpectedError}>
      <Button variant="primary" onClick={() => retry()}>{t.errors.tryAgain}</Button>
      <StatusLinks links={[{ href: `/${locale}`, label: t.cta.home }]} />
    </StatusPage>
  );
}
