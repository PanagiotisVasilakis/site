"use client";
import { useEffect, useRef } from 'react';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function ErrorSummary({
  summary,
  details,
  onRetry,
  supportHref,
  locale,
}: {
  summary: string;
  details?: string[];
  onRetry?: () => void;
  supportHref?: string;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Move focus to the error summary so SR announces it
    ref.current?.focus();
  }, [summary]);

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className="ui-callout ui-callout--danger error-summary"
    >
      <div className="error-summary__title">{t.errors.title}</div>
      <div>{summary}</div>
      {details && details.length > 0 ? (
        <ul className="error-summary__details">
          {details.slice(0, 5).map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
      <div className="error-summary__actions">
        {onRetry ? (
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onRetry}>{t.errors.tryAgain}</button>
        ) : null}
        <a className="ui-btn ui-btn--secondary ui-btn--sm" href={supportHref ?? `/${locale}#contact`}>{t.errors.contactSupport}</a>
      </div>
    </div>
  );
}
