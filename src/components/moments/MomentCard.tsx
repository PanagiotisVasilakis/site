"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';

interface MomentCardProps {
    id: string;
    slug: string;
    name: string;
    summary?: string;
    description?: string;
    rating?: number;
    price?: string;
    icon?: string;
    image?: string;
    heroImage?: string;
    heroImagePosition?: string;
    priority?: boolean;
    tags?: string[];
    address?: string;
    location?: { lat: number; lng: number };
    directionsUrl?: string;
    categorySlug: string;
    locale: string;
}

const tagLabels: Record<string, string> = {
    archaeology: 'Archaeology',
    bar: 'Bar',
    beach: 'Beach',
    brunch: 'Brunch',
    cafe: 'Cafe',
    culture: 'Culture',
    food: 'Food',
    history: 'History',
    hiking: 'Hiking',
    military: 'History',
    mountain: 'Taygetos',
    museum: 'Museum',
    nearby: 'Nearby',
    nightlife: 'Nightlife',
    outdoor: 'Outdoor',
    railway: 'Railway',
    restaurant: 'Restaurant',
    sightseeing: 'Site',
    site: 'Site',
    taygetos: 'Taygetos',
};

function categoryTone(tags?: string[]) {
    const tagSet = new Set(tags ?? []);
    if (tagSet.has('beach')) return 'is-beach';
    if (tagSet.has('restaurant') || tagSet.has('food') || tagSet.has('brunch') || tagSet.has('cafe')) return 'is-food';
    if (tagSet.has('bar') || tagSet.has('nightlife')) return 'is-nightlife';
    if (tagSet.has('taygetos') || tagSet.has('mountain') || tagSet.has('hiking')) return 'is-mountain';
    if (tagSet.has('site') || tagSet.has('sightseeing') || tagSet.has('archaeology')) return 'is-site';
    return 'is-culture';
}

function primaryTag(tags?: string[]) {
    const tag = tags?.find(candidate => tagLabels[candidate]);
    return tag ? tagLabels[tag] : undefined;
}

function mapHref(directionsUrl?: string, location?: { lat: number; lng: number }, address?: string) {
    if (directionsUrl) return directionsUrl;
    if (location) return `https://maps.google.com/?q=${location.lat},${location.lng}`;
    if (address) return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    return undefined;
}

export function MomentCard({
    id,
    slug,
    name,
    summary,
    description,
    rating,
    price,
    icon,
    image,
    heroImage,
    heroImagePosition,
    priority,
    tags,
    address,
    location,
    directionsUrl,
    categorySlug,
    locale,
}: MomentCardProps) {
    const { isFavorite, toggle } = useFavorites();
    const { push } = useToast();
    const favoriteId = `${categorySlug}:${id}`;
    const isWished = isFavorite(favoriteId);
    const href = `/${locale}/${categorySlug}/${slug}`;
    const directionsHref = mapHref(directionsUrl, location, address);
    const tag = primaryTag(tags);
    const copy = summary || description;
    const metadata = [
        tag,
        rating ? `${rating.toFixed(1)} rating` : undefined,
        price,
        address,
    ].filter((item): item is string => Boolean(item));

    const handleFavoriteToggle = () => {
        const wasFavorite = isFavorite(favoriteId);
        toggle(favoriteId);
        push(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
    };

    return (
        <article className="moment-card">
            <Link href={href} className="moment-card-main" aria-label={`View details for ${name}`}>
                <span className={`moment-card-visual ${categoryTone(tags)}`}>
                    {heroImage ? (
                        <Image
                            src={heroImage}
                            alt=""
                            fill
                            priority={priority}
                            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 380px"
                            className="moment-card-hero-image"
                            style={{ objectPosition: heroImagePosition || 'center' }}
                        />
                    ) : (
                        <span className="moment-card-visual-mark" aria-hidden>{tag || 'Kalamata'}</span>
                    )}
                </span>

                <span className="moment-card-avatar" aria-hidden>
                    {image ? (
                        <Image
                            src={image}
                            alt=""
                            width={72}
                            height={72}
                            className="moment-card-avatar-image"
                        />
                    ) : (
                        <span>{icon || momentsLayoutConfig.card.defaultIcon}</span>
                    )}
                </span>

                <span className="moment-card-content">
                    <span className="moment-card-title">{name}</span>
                    {copy && <span className="moment-card-summary">{copy}</span>}
                    {metadata.length > 0 && (
                        <span className="moment-card-meta" aria-label="Place details">
                            {metadata.map(item => (
                                <span key={item}>{item}</span>
                            ))}
                        </span>
                    )}
                </span>
            </Link>

            <button
                type="button"
                aria-label={isWished ? 'Remove from favorites' : 'Save to favorites'}
                className={`moment-favorite-button ${isWished ? 'is-active' : ''}`}
                onClick={handleFavoriteToggle}
            >
                <span aria-hidden>{isWished ? '\u2665' : '\u2661'}</span>
            </button>

            <div className="moment-card-actions">
                <Link href={href} className="moment-card-action moment-card-action-primary">
                    View details
                </Link>
                {directionsHref && (
                    <a
                        href={directionsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="moment-card-action"
                        aria-label={`Open map for ${name}`}
                    >
                        Open map
                    </a>
                )}
            </div>
        </article>
    );
}
