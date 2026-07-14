"use client";
import { useEffect, useRef } from 'react';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function ErrorSummary({
  title,
  summary,
  details,
  onRetry,
  supportHref = '/en#contact',
  locale = 'en',
}: {
  title?: string;
  summary: string;
  details?: string[];
  onRetry?: () => void;
  supportHref?: string;
  locale?: string;
}) {
  const t = getDictionary(locale as Locale);
  const resolvedTitle = title ?? t.errors?.title ?? 'There were some problems';
  const tryAgainLabel = t.errors?.tryAgain ?? 'Try again';
  const contactSupportLabel = t.errors?.contactSupport ?? 'Contact support';
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
      className="rounded-lg border border-red-300 bg-red-50 text-red-900 px-3 py-2 text-sm"
    >
      <div className="font-semibold mb-1">{resolvedTitle}</div>
      <div>{summary}</div>
      {details && details.length > 0 ? (
        <ul className="list-disc ml-5 mt-2">
          {details.slice(0, 5).map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex gap-2">
        {onRetry ? (
          <button type="button" className="btn-outline btn-sm" onClick={onRetry}>{tryAgainLabel}</button>
        ) : null}
        <a className="btn-outline btn-sm" href={supportHref}>{contactSupportLabel}</a>
      </div>
    </div>
  );
}
