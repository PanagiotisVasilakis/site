/**
 * GuideFilters categories (identity §8 GuideFilters, §9.5; REVIEW.md R-325/R-326 decision). Every key keeps
 * its tag list, but a chip renders only when its category has content (`chipCounts`), so categories without
 * places stay hidden until content is added. Labels come from `momentsFilters` (common.ts).
 */
export const GUIDE_FILTER_KEYS = [
  'all', 'beaches', 'museums', 'restaurants', 'bars', 'brunchs', 'taygetos', 'sites', 'nearby',
] as const;

export type GuideFilterKey = typeof GUIDE_FILTER_KEYS[number];

const FILTER_TAGS: Record<Exclude<GuideFilterKey, 'all'>, readonly string[]> = {
  beaches: ['beach'],
  museums: ['museum'],
  restaurants: ['restaurant', 'food'],
  bars: ['bar', 'nightlife'],
  brunchs: ['brunch', 'cafe'],
  taygetos: ['taygetos', 'mountain', 'hiking'],
  sites: ['site', 'sightseeing', 'archaeology', 'history'],
  nearby: ['nearby'],
};

/** The items in a category; 'all' keeps every item. */
export function filterByCategory<T extends { tags: readonly string[] }>(items: readonly T[], key: GuideFilterKey): T[] {
  if (key === 'all') return [...items];
  const tags = FILTER_TAGS[key];
  return items.filter((item) => item.tags.some((tag) => tags.includes(tag)));
}

/** The chips to render, with their counts: 'all' (when there is any item) and every non-empty category. */
export function chipCounts<T extends { tags: readonly string[] }>(items: readonly T[]): Array<{ key: GuideFilterKey; count: number }> {
  return GUIDE_FILTER_KEYS
    .map((key) => ({ key, count: filterByCategory(items, key).length }))
    .filter(({ count }) => count > 0);
}
