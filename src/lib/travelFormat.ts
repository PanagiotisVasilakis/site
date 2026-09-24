// Utility formatting helpers for travel distance/time chips.
// Keeps presentational HTML snippets isolated from map logic.

export type TravelMode = 'driving' | 'foot' | 'cycling';

type DistanceDurationLabels = {
  distanceLabel: string;
  durationLabel: string;
};

function formatDistanceDuration(distMeters: number, durSeconds: number): DistanceDurationLabels {
  const km = distMeters / 1000;
  const distanceLabel = km < 1 ? `${Math.round(distMeters)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`;
  const mins = Math.round(durSeconds / 60);
  const durationLabel = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h${mins % 60 ? (mins % 60) + 'm' : ''}`;
  return { distanceLabel, durationLabel };
}

export function travelModeIcon(mode: TravelMode): string {
  return mode === 'driving' ? '🚗' : mode === 'foot' ? '🚶' : '🚲';
}

export function formatTravelChip(mode: TravelMode, distMeters?: number, durSeconds?: number): string {
  if (!distMeters || !durSeconds) return '';
  const { distanceLabel, durationLabel } = formatDistanceDuration(distMeters, durSeconds);
  const icon = travelModeIcon(mode);
  return `<span class=\"inline-flex items-center gap-1 bg-black/10 dark:bg-white/10 px-2 py-[2px] rounded-full\">${icon}<span>${distanceLabel} • ${durationLabel}</span></span>`;
}
