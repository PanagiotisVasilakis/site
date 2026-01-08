"use client";

import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';

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

/**
 * Horizontal scrollable filter menu for Moments page.
 * Displays pill-shaped buttons for each category.
 */
export function MomentsFilterMenu({ active, onChange, ui }: MomentsFilterMenuProps) {
    const config = momentsLayoutConfig.filterMenu;

    const labels: Record<MomentsFilterKey, string> = {
        all: ui?.all || 'All',
        beaches: ui?.beaches || 'Beaches',
        museums: ui?.museums || 'Museums',
        restaurants: ui?.restaurants || 'Restaurants',
        bars: ui?.bars || 'Bars',
        brunchs: ui?.brunchs || 'Brunchs',
        taygetos: ui?.taygetos || 'Taygetos',
        sites: ui?.sites || 'Sites',
        nearby: ui?.nearby || 'Nearby',
    };

    return (
        <nav className={config.containerClass} aria-label="Filter moments by category">
            <div className={config.scrollClass}>
                {MOMENTS_FILTER_KEYS.map(key => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`${config.buttonClass} ${active === key ? config.activeClass : config.inactiveClass}`}
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
 * Returns all items if 'all' is selected or if no matching tags are found.
 */
export function filterMomentsByCategory<T extends { tags?: string[] }>(
    items: T[],
    filter: MomentsFilterKey
): T[] {
    const tags = filterToTags[filter];
    if (!tags) return items; // 'all' filter
    return items.filter(item => item.tags?.some(t => tags.includes(t)));
}
