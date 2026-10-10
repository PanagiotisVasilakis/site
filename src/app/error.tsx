"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { errorReporter } from '@/lib/errorReporting';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
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
  const locale: Locale = pathname?.startsWith('/el') ? 'el' : 'en';
  const t = getDictionary(locale);

  useEffect(() => {
    // Report error with full context
    console.error('Global unhandled UI error', {
      errorDetails: {
        name: error.name,
        message: error.message,
        digest: error.digest,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      },
      context: 'global-error-boundary',
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
    }, error);

    // Report once per error to the server-side error log.
    void errorReporter.reportError(error, { category: 'globalError' });
  }, [error]);

  return (
    <main id="main-content" className="status-main" role="main">
      <StatusPage title={t.errors.somethingWentWrong} lead={t.errors.unexpectedError}>
        <Button variant="primary" className="status-page__action" onClick={() => retry()}>{t.errors.tryAgain}</Button>
        <StatusLinks links={[{ href: `/${locale}`, label: t.cta.home }]} />
      </StatusPage>
    </main>
  );
}
