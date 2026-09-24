/**
 * Centralized configuration for Moments (places) layout
 * Used by both list and detail views for consistent UI/UX
 */

export const momentsLayoutConfig = {
    /** Grid layout settings for the moments list page */
    grid: {
        containerClass: 'moments-shell',
        gridClass: 'moments-grid',
    },

    /** Card styles for list items */
    card: {
        defaultIcon: '🍽️',
    },

    /** Detail page layout settings */
    detail: {
        containerClass: 'page-container mx-auto max-w-7xl space-y-6 safe-bottom',
        headerClass: 'flex flex-col gap-2 pt-6',
        titleClass: 'text-2xl font-serif italic font-bold flex items-center gap-2',
        summaryClass: 'text-sm opacity-80',
        imageClass: 'w-full max-h-80',
        ctaGridClass: 'grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2',
        tagsContainerClass: 'flex flex-wrap gap-2 pt-4',
        tagClass: 'text-xs rounded-full px-2 py-1 border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]',
    },

    /** Badge for recently updated items */
    updatedBadge: {
        class: 'text-xs rounded bg-amber-200 text-amber-900 px-2 py-0.5',
    },
} as const;
