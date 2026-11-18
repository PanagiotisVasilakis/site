"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logger } from '@/lib/logger-client';
import { errorReporter } from '@/lib/errorReporting';
import { getDictionary } from '@/i18n/dictionaries';
import { defaultLocale, pathLocale } from '@/i18n/config';
import { Button } from '@/components/ui/Button';
import { StatusLinks, StatusPage } from '@/components/stay/StatusPage';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// identity §9.10: the same calm layout as the 404, "Try again" (retry) and a Home link; no technical
// details on the page (the error is reported to the server-side error log).
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  const pathname = usePathname();
  const locale = (pathname ? pathLocale(pathname) : null) ?? defaultLocale;
  const t = getDictionary(locale);

  useEffect(() => {
    logger.error('Unhandled UI error (global)', {
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      digest: error.digest,
    });

    // Report once per error to the server-side error log.
    void errorReporter.reportError(error, { category: 'globalError' });
  }, [error]);

  return (
    <main id="main-content" className="status-main">
      <StatusPage title={t.errors.somethingWentWrong} lead={t.errors.unexpectedError}>
        <Button variant="primary" onClick={() => retry()}>{t.errors.tryAgain}</Button>
        <StatusLinks links={[{ href: `/${locale}`, label: t.cta.home }]} />
      </StatusPage>
    </main>
  );
}
