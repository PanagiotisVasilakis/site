"use client";
import React, { useEffect, useRef } from 'react';

export default function ErrorSummary({
  title = 'There were some problems',
  summary,
  details,
  onRetry,
  supportHref = '/en/contact',
}: {
  title?: string;
  summary: string;
  details?: string[];
  onRetry?: () => void;
  supportHref?: string;
}) {
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
      <div className="font-semibold mb-1">{title}</div>
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
          <button type="button" className="btn-outline btn-sm" onClick={onRetry}>Try again</button>
        ) : null}
        <a className="btn-outline btn-sm" href={supportHref}>Contact support</a>
      </div>
    </div>
  );
}
