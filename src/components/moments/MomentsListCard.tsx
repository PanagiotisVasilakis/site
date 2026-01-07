"use client";

import Image from 'next/image';
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';

interface MomentsListCardProps {
    id: string;
    slug: string;
    name: string;
    summary?: string;
    rating?: number;
    price?: string;
    icon?: string;
    image?: string;
    categorySlug: string;
    locale: string;
}

/**
 * Standardized card component for moments/places in grid listing.
 * Uses centralized config for consistent styling across all moment items.
 */
export function MomentsListCard({
    id,
    slug,
    name,
    summary,
    rating,
    price,
    icon,
    image,
    categorySlug,
    locale,
}: MomentsListCardProps) {
    const { isFavorite, toggle } = useFavorites();
    const { push } = useToast();
    const config = momentsLayoutConfig.card;

    const favoriteId = `${categorySlug}:${id}`;
    const isWished = isFavorite(favoriteId);

    const handleFavoriteToggle = () => {
        const wasFavorite = isFavorite(favoriteId);
        toggle(favoriteId);
        push(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
    };

    return (
        <div className={config.containerClass}>
            <a
                href={`/${locale}/${categorySlug}/${slug}`}
                className={config.linkClass}
            >
                {image ? (
                    <div className="w-16 h-16 mb-3 rounded-xl overflow-hidden group-hover:scale-110 transition-transform bg-white/80 dark:bg-gray-800/80 p-1 flex items-center justify-center">
                        <Image
                            src={image}
                            alt={name}
                            width={56}
                            height={56}
                            className="object-contain w-full h-full"
                        />
                    </div>
                ) : (
                    <div className={config.iconClass} aria-hidden>
                        {icon || config.defaultIcon}
                    </div>
                )}
                <div className={config.nameClass}>{name}</div>
                {summary && <p className={config.summaryClass}>{summary}</p>}
                {rating && (
                    <div className={config.ratingClass}>
                        <span aria-hidden>⭐</span>
                        {rating.toFixed(1)}
                    </div>
                )}
                {price && <div className={config.priceClass}>{price}</div>}
            </a>
            <button
                type="button"
                aria-label={isWished ? 'Remove favorite' : 'Add to favorites'}
                className={config.wishlistBtnClass}
                onClick={handleFavoriteToggle}
            >
                <span aria-hidden>{isWished ? '❤️' : '🤍'}</span>
            </button>
        </div>
    );
}
