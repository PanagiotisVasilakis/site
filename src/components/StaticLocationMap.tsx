"use client";
import React from 'react';

interface StaticLocationMapProps {
  height?: string;
  className?: string;
  title?: string;
  locale?: string;
  compact?: boolean; // show condensed variant (e.g., sidebar)
  showHeading?: boolean; // allow parent section to provide its own heading
  variant?: 'full' | 'panel'; // panel: render only textual panel (no outer gradient / heading container)
}

// Fallback component when JavaScript or tiles are unavailable
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function StaticLocationMap({ 
  height = "400px", 
  className = "",
  title,
  locale = 'en',
  compact = false,
  showHeading = true,
  variant = 'full'
}: StaticLocationMapProps) {
  const eff: Locale = locale === 'el' ? 'el' : 'en';
  const t = getDictionary(eff);
  const lp = t.locationPanel;
  const Panel = () => (
    <div className="space-y-3 text-sm">
      <section className="bg-white/70 rounded-lg p-4">
        <header className="flex items-center gap-2 mb-2">
          <span aria-hidden>🏡</span>
          <strong>{lp?.apartmentTitle}</strong>
        </header>
        <p className="text-gray-700 text-sm leading-snug">{lp?.city}</p>
        <p className="text-gray-600 whitespace-pre-wrap break-words leading-snug mt-1">{lp?.blurb}</p>
      </section>
      {!compact && (
        <section className="bg-white/70 rounded-lg p-4">
          <div className="text-xs font-semibold text-brand-700 uppercase mb-2">{lp?.nearby}</div>
          <ul className="space-y-1 text-gray-700 list-none m-0 p-0">
            {lp?.attractions?.map(a => <li key={a}>{a}</li>)}
          </ul>
        </section>
      )}
      {!compact && (
        <aside className="text-xs text-gray-500 bg-white/50 rounded-lg p-3">
          <p className="mb-2 font-semibold flex items-center gap-1"><span aria-hidden>💡</span>{lp?.howToEnableMapTitle}</p>
          <ol className="text-left space-y-1 list-decimal list-inside">
            {lp?.howToEnableSteps?.map((step, i) => (
              <li key={i} className="leading-snug">
                {step}
              </li>
            ))}
          </ol>
        </aside>
      )}
    </div>
  );

  if (variant === 'panel') {
    return (
      <div className={className}>
        {showHeading && (
          <h3 className="text-lg font-semibold text-[color:var(--fg-default)] mb-3" data-testid="static-map-title">{title || lp?.title}</h3>
        )}
        <Panel />
      </div>
    );
  }

  return (
    <div className={`${className} relative`} style={{ height }}>
      <div className="w-full h-full bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg flex items-center justify-center border border-brand-200">
        <div className="text-center p-6 sm:p-8 max-w-md w-full">
          {showHeading && (
            <div className="flex flex-col items-center mb-4">
              <div className="text-5xl mb-2" aria-hidden>🏖️</div>
              <h3 className="text-lg sm:text-xl font-semibold text-brand-800" data-testid="static-map-title">{title || lp?.title}</h3>
            </div>
          )}
          <Panel />
        </div>
      </div>
    </div>
  );
}
