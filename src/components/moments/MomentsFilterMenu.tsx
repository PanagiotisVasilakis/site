"use client";

/** Filter categories for Moments page */
export const MOMENTS_FILTER_KEYS = [
    'all', 'beaches', 'museums', 'restaurants', 'bars', 'brunchs', 'taygetos', 'sites', 'nearby'
] as const;

export type MomentsFilterKey = typeof MOMENTS_FILTER_KEYS[number];

/** Maps filter keys to the tags used in moments.json */
const filterToTags: Record<MomentsFilterKey, string[] | null> = {
    all: null, // null means show all
    beaches: ['beach'],
    museums: ['museum'],
    restaurants: ['restaurant', 'food'],
    bars: ['bar', 'nightlife'],
    brunchs: ['brunch', 'cafe'],
    taygetos: ['taygetos', 'mountain', 'hiking'],
    sites: ['site', 'sightseeing', 'archaeology', 'history'],
    nearby: ['nearby'], // proximity-based, may need special handling
};

interface MomentsFilterMenuProps {
    active: MomentsFilterKey;
    onChange: (filter: MomentsFilterKey) => void;
    filterByCategoryLabel?: string;
    availableFilters?: readonly MomentsFilterKey[];
    ui?: {
        all?: string;
        beaches?: string;
        museums?: string;
        restaurants?: string;
        bars?: string;
        brunchs?: string;
        taygetos?: string;
        sites?: string;
        nearby?: string;
    };
}

const labelsFor = (ui: MomentsFilterMenuProps['ui']): Record<MomentsFilterKey, string> => ({
    all: ui?.all || 'All',
    beaches: ui?.beaches || 'Beaches',
    museums: ui?.museums || 'Museums',
    restaurants: ui?.restaurants || 'Restaurants',
    bars: ui?.bars || 'Bars',
    brunchs: ui?.brunchs || 'Brunchs',
    taygetos: ui?.taygetos || 'Taygetos',
    sites: ui?.sites || 'Sites',
    nearby: ui?.nearby || 'Nearby',
});

/**
 * Horizontal scrollable category chips for Moments page.
 */
export function CategoryChips({
    active,
    onChange,
    ui,
    filterByCategoryLabel = 'Filter moments by category',
    availableFilters = MOMENTS_FILTER_KEYS,
}: MomentsFilterMenuProps) {
    const labels = labelsFor(ui);

    return (
        <nav className="moments-chip-nav" aria-label={filterByCategoryLabel}>
            <div className="moments-chip-scroll">
                {MOMENTS_FILTER_KEYS.filter(key => availableFilters.includes(key)).map(key => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`moments-chip ${active === key ? 'is-active' : ''}`}
                        aria-pressed={active === key}
                    >
                        {labels[key]}
                    </button>
                ))}
            </div>
        </nav>
    );
}

/**
 * Filters items based on the selected moments filter.
 * Returns all items only when 'all' is selected.
 */
export function filterMomentsByCategory<T extends { tags?: string[] }>(
    items: T[],
    filter: MomentsFilterKey
): T[] {
    const tags = filterToTags[filter];
    if (!tags) return items; // 'all' filter
    return items.filter(item => item.tags?.some(t => tags.includes(t)));
}
