/**
 * Centralized configuration for Moments (places) layout
 * Used by both list and detail views for consistent UI/UX
 */

export const momentsLayoutConfig = {
    /** Grid layout settings for the moments list page */
    grid: {
        containerClass: 'max-w-5xl mx-auto px-4 mb-6',
        gridClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mx-auto',
    },

    /** Card styles for list items */
    card: {
        containerClass: 'relative h-full',
        linkClass: 'card p-6 flex flex-col items-center text-center transition-all group hover:shadow-lg h-full min-h-[220px]',
        iconClass: 'text-4xl mb-3 group-hover:scale-110 transition-transform',
        defaultIcon: '🍽️',
        nameClass: 'text-lg font-medium mb-2 line-clamp-2',
        summaryClass: 'text-sm opacity-80 line-clamp-2 flex-grow',
        ratingClass: 'mt-2 text-sm font-semibold flex items-center gap-1',
        priceClass: 'mt-1 text-sm opacity-70',
        wishlistBtnClass: 'wishlist-btn',
    },

    /** Detail page layout settings */
    detail: {
        containerClass: 'page-container mx-auto max-w-7xl space-y-6 safe-bottom',
        headerClass: 'flex flex-col gap-2 pt-6',
        titleClass: 'text-2xl font-serif italic font-bold flex items-center gap-2',
        summaryClass: 'text-sm opacity-80',
        imageClass: 'w-full max-h-80',
        /** CTA buttons to show - order matters */
        ctaButtons: ['call', 'directions', 'website', 'reserve'] as const,
        ctaGridClass: 'grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2',
        tagsContainerClass: 'flex flex-wrap gap-2 pt-4',
        tagClass: 'text-xs rounded-full px-2 py-1 border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]',
    },

    /** Badge for recently updated items */
    updatedBadge: {
        class: 'text-xs rounded bg-amber-200 text-amber-900 px-2 py-0.5',
    },
} as const;

export type MomentsLayoutConfig = typeof momentsLayoutConfig;
