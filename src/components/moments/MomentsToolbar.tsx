"use client";

import { CategoryChips, type MomentsFilterKey } from './MomentsFilterMenu';

interface MomentsToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    activeFilter: MomentsFilterKey;
    onFilterChange: (filter: MomentsFilterKey) => void;
    showMap: boolean;
    onMapToggle: () => void;
    mapLabel?: string;
    listLabel?: string;
    filters?: {
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

export function MomentsToolbar({
    search,
    onSearchChange,
    activeFilter,
    onFilterChange,
    showMap,
    onMapToggle,
    mapLabel = 'Map',
    listLabel = 'List',
    filters,
}: MomentsToolbarProps) {
    return (
        <div className="moments-toolbar" role="region" aria-label="Search and filter moments">
            <label className="moments-search">
                <span className="sr-only">Search moments</span>
                <input
                    type="search"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search places, beaches, museums..."
                    className="moments-search-input"
                />
            </label>

            <CategoryChips active={activeFilter} onChange={onFilterChange} ui={filters} />

            <button
                type="button"
                className="moments-map-button"
                onClick={onMapToggle}
                aria-pressed={showMap}
            >
                {showMap ? listLabel : mapLabel}
            </button>
        </div>
    );
}
