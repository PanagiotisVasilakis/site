import type { Dictionary } from '@/i18n/dictionaries';

export type LocationHighlight = { icon?: string; title: string; description: string };

// Normalize location/nearby strings into a structured list of highlights.
// Current behavior: only the structured `dictionary.locationPanel.highlights`
// are considered the canonical source-of-truth. We intentionally do NOT
// parse legacy `attractions` string lists or `house.distances` here — callers
// should provide `highlights` in the dictionary. This keeps parsing logic
// centralized and avoids duplication across components.
export function getLocationHighlights(dict: Dictionary): LocationHighlight[] {
  const lp = dict.locationPanel;
  if (lp?.highlights && lp.highlights.length > 0) {
    return lp.highlights.map((h) => ({ icon: h.icon, title: h.title, description: h.description }));
  }
  // No structured highlights available — return empty list.
  return [];
}

export default getLocationHighlights;
