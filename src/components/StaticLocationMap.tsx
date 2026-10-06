"use client";

interface StaticLocationMapProps {
  height?: string;
  className?: string;
  locale?: string;
}

// Fallback component when JavaScript or tiles are unavailable
import { getDictionary } from '@/i18n/dictionaries';
import { getKalamataLandmarks } from '@/data/mapLocations';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';
import type { MapMarkerType } from '@/data/mapLocations';

type LocationHighlight = { icon?: string; title: string; description: string };

function iconForMarkerType(markerType: MapMarkerType): string {
  switch (markerType) {
    case 'beach':
      return '🏖️';
    case 'city-center':
      return '🏙️';
    case 'church':
      return '⛪';
    case 'shop':
      return '🛒';
    default:
      return '📍';
  }
}

export default function StaticLocationMap({
  height = "400px",
  className = "",
  locale = 'en',
}: StaticLocationMapProps) {
  const eff: Locale = normalizeLocale(locale);
  const t = getDictionary(eff);
  const lp = t.locationPanel;
  const highlights: LocationHighlight[] = getKalamataLandmarks(eff).map((landmark) => ({
    icon: iconForMarkerType(landmark.markerType),
    title: landmark.name,
    description: landmark.description ?? '',
  }));
  const panel = (
    <div className="space-y-3 text-sm">
      <section className="rounded-tile border border-border bg-surface p-4">
        <header className="flex items-center gap-2 mb-2">
          <span aria-hidden>🏡</span>
          <strong>{lp.apartmentTitle}</strong>
        </header>
        <p className="text-fg-muted text-sm leading-snug">{lp.city}</p>
        <p className="text-fg-muted whitespace-pre-wrap break-words leading-snug mt-1">{lp.blurb}</p>
      </section>
      <section className="rounded-tile border border-border bg-surface p-4">
        <div className="text-xs font-semibold text-primary-text uppercase mb-2">{lp.nearby}</div>
        {highlights.length > 0 ? (
          <ul className="space-y-2 text-fg-muted list-none m-0 p-0">
            {highlights.map(({ icon, title, description }) => (
              <li key={`${title}-${description}`} className="flex items-start gap-3">
                {icon && (
                  <span className="text-lg leading-tight" aria-hidden>
                    {icon}
                  </span>
                )}
                <div className="leading-tight">
                  <div className="font-medium">{title}</div>
                  <div className="text-xs text-fg-muted mt-0.5">{description}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <aside className="text-xs text-fg-muted bg-surface-sunken rounded-tile p-3">
        <p className="mb-2 font-semibold flex items-center gap-1"><span aria-hidden>💡</span>{lp.howToEnableMapTitle}</p>
        <ol className="text-left space-y-1 list-decimal list-inside">
          {lp.howToEnableSteps.map((step, i) => (
            <li key={i} className="leading-snug">
              {step}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );

  return (
    <div className={`${className} relative`} style={{ height }}>
      <div className="w-full h-full bg-surface-sunken rounded-tile flex items-center justify-center border border-border">
        <div className="text-center p-6 sm:p-8 max-w-md w-full">
          {panel}
        </div>
      </div>
    </div>
  );
}
