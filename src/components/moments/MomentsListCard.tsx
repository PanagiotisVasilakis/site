"use client";

import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import GuideOptionCard from '@/components/GuideOptionCard';
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
    const meta = rating || price ? (
        <>
            {rating && (
                <span className={config.ratingClass}>
                    <span aria-hidden>⭐</span>
                    {rating.toFixed(1)}
                </span>
            )}
            {price && <span className={config.priceClass}>{price}</span>}
        </>
    ) : undefined;

    const handleFavoriteToggle = () => {
        const wasFavorite = isFavorite(favoriteId);
        toggle(favoriteId);
        push(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
    };

    return (
        <GuideOptionCard
            href={`/${locale}/${categorySlug}/${slug}`}
            title={name}
            summary={summary}
            image={image}
            imageAlt={name}
            icon={icon || config.defaultIcon}
            meta={meta}
            action={
                <button
                    type="button"
                    aria-label={isWished ? 'Remove favorite' : 'Add to favorites'}
                    className={config.wishlistBtnClass}
                    onClick={handleFavoriteToggle}
                >
                    <span aria-hidden>{isWished ? '❤️' : '🤍'}</span>
                </button>
            }
        />
    );
}
