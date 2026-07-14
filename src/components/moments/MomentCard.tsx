"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';
import { mapsHref, telHref } from '@/lib/contactLinks';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

interface MomentCardProps {
    id: string;
    slug: string;
    name: string;
    summary?: string;
    description?: string;
    rating?: number;
    icon?: string;
    image?: string;
    heroImage?: string;
    heroImagePosition?: string;
    priority?: boolean;
    tags?: string[];
    address?: string;
    location?: { lat: number; lng: number };
    directionsUrl?: string;
    phone?: string;
    phones?: string[];
    website?: string;
    hideAddressOnFront?: boolean;
    categorySlug: string;
    locale: string;
    labels?: {
        viewDetails: string;
        back: string;
        call: string;
        directions: string;
        website: string;
    };
}

const tagLabels: Record<string, string> = {
    archaeology: 'Archaeology',
    bar: 'Bar',
    beach: 'Beach',
    brunch: 'Brunch',
    cafe: 'Cafe',
    culture: 'Culture',
    emergency: 'Emergency',
    food: 'Food',
    health: 'Health',
    history: 'History',
    hiking: 'Hiking',
    hospital: 'Hospital',
    military: 'History',
    medical: 'Medical',
    mountain: 'Taygetos',
    museum: 'Museum',
    nearby: 'Nearby',
    nightlife: 'Nightlife',
    outdoor: 'Outdoor',
    police: 'Police',
    railway: 'Railway',
    restaurant: 'Restaurant',
    safety: 'Safety',
    sightseeing: 'Site',
    site: 'Site',
    taygetos: 'Taygetos',
    taxi: 'Taxi',
    transport: 'Transport',
};

function categoryTone(tags?: string[]) {
    const tagSet = new Set(tags ?? []);
    if (tagSet.has('emergency') || tagSet.has('police') || tagSet.has('safety')) return 'is-emergency';
    if (tagSet.has('health') || tagSet.has('medical') || tagSet.has('hospital')) return 'is-health';
    if (tagSet.has('transport') || tagSet.has('taxi')) return 'is-transport';
    if (tagSet.has('beach')) return 'is-beach';
    if (tagSet.has('restaurant') || tagSet.has('food') || tagSet.has('brunch') || tagSet.has('cafe')) return 'is-food';
    if (tagSet.has('bar') || tagSet.has('nightlife')) return 'is-nightlife';
    if (tagSet.has('taygetos') || tagSet.has('mountain') || tagSet.has('hiking')) return 'is-mountain';
    if (tagSet.has('site') || tagSet.has('sightseeing') || tagSet.has('archaeology')) return 'is-site';
    return 'is-culture';
}

function primaryTagKey(tags?: string[]) {
    return tags?.find(candidate => tagLabels[candidate]);
}

function PhoneServiceIcon({ id }: { id: string }) {
    const common = {
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        focusable: false,
        'aria-hidden': true,
    };

    if (id === 'emergency-112') {
        return (
            <svg {...common}>
                <path d="M12 3l7 3v5.5c0 4.2-2.7 7.3-7 9.5-4.3-2.2-7-5.3-7-9.5V6l7-3z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
            </svg>
        );
    }

    if (id === 'police') {
        return (
            <svg {...common}>
                <path d="M12 3l7 3v5.5c0 4.2-2.7 7.3-7 9.5-4.3-2.2-7-5.3-7-9.5V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
            </svg>
        );
    }

    if (id === 'fire-department') {
        return (
            <svg {...common}>
                <path d="M12 21c3.3 0 6-2.4 6-5.9 0-3-1.8-5.2-4.5-7.8-.6 2.1-1.7 3.4-3.5 4.6.2-2.8-.8-5.1-2.7-6.9C5.7 8 6 10.2 6 12.2 6 17.1 8.5 21 12 21z" />
                <path d="M12 18c1.2 0 2.2-.9 2.2-2.2 0-1-.6-1.8-1.7-2.9-.2.8-.6 1.3-1.3 1.8.1-1-.2-1.8-.9-2.5-.6 1.1-.7 1.9-.7 2.6 0 1.8.9 3.2 2.4 3.2z" />
            </svg>
        );
    }

    if (id === 'kalamata-hospital') {
        return (
            <svg {...common}>
                <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                <path d="M3 21h18" />
                <path d="M12 7v6" />
                <path d="M9 10h6" />
                <path d="M9 21v-4h6v4" />
            </svg>
        );
    }

    if (id === 'taxi') {
        return (
            <svg {...common}>
                <path d="M5 16h14" />
                <path d="M6.5 16l1.3-5.1A3 3 0 0 1 10.7 8h2.6a3 3 0 0 1 2.9 2.9l1.3 5.1" />
                <path d="M8 16v2" />
                <path d="M16 16v2" />
                <path d="M9 8l.8-2h4.4l.8 2" />
                <circle cx="8" cy="18" r="1" />
                <circle cx="16" cy="18" r="1" />
            </svg>
        );
    }

    return (
        <svg {...common}>
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
        </svg>
    );
}

export function MomentCard({
    id,
    slug,
    name,
    summary,
    description,
    rating,
    icon,
    image,
    heroImage,
    heroImagePosition,
    priority,
    tags,
    address,
    location,
    directionsUrl,
    phone,
    phones,
    website,
    hideAddressOnFront,
    categorySlug,
    locale,
    labels,
}: MomentCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const { isFavorite, toggle } = useFavorites();
    const { push } = useToast();
    const t = getDictionary(locale as Locale);
    const favoriteId = `${categorySlug}:${id}`;
    const isWished = isFavorite(favoriteId);
    const detailsId = useId();
    const href = `/${locale}/${categorySlug}/${slug}`;
    const directionsHref = directionsUrl || mapsHref(address, location?.lat, location?.lng);
    const phoneNumbers = Array.from(new Set([phone, ...(phones ?? [])].filter(Boolean) as string[]));
    const primaryPhoneHref = telHref(phoneNumbers[0]);
    const tagKey = primaryTagKey(tags);
    const tag = tagKey ? (t.momentTags?.[tagKey] ?? tagLabels[tagKey]) : undefined;
    const copy = summary || description;
    const detailCopy = description || summary;
    const isSvgImage = Boolean(image && image.endsWith('.svg'));
    const isPhoneCard = categorySlug === 'phones';
    const cardLabels = {
        viewDetails: labels?.viewDetails ?? 'View details',
        back: labels?.back ?? 'Back',
        call: labels?.call ?? 'Call',
        directions: labels?.directions ?? 'Directions',
        website: labels?.website ?? 'Website',
    };
    const metadata = [
        tag,
        rating ? (t.labels?.rating ?? '{value} rating').replace('{value}', rating.toFixed(1)) : undefined,
        hideAddressOnFront ? undefined : address,
    ].filter((item): item is string => Boolean(item));

    const handleFavoriteToggle = () => {
        const wasFavorite = isFavorite(favoriteId);
        toggle(favoriteId);
        push(wasFavorite ? (t.labels?.removedFavorite ?? 'Removed from favorites') : (t.labels?.addedFavorite ?? 'Added to favorites'));
    };

    const frontContent = (
        <>
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

            <span className={`moment-card-avatar${isPhoneCard ? ` moment-card-service-icon moment-card-service-${id}` : ''}`} aria-hidden>
                {isPhoneCard ? (
                    <PhoneServiceIcon id={id} />
                ) : image ? (
                    <Image
                        src={image}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized={isSvgImage}
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
                    <span className="moment-card-meta" aria-label={t.a11y?.placeDetails ?? 'Place details'}>
                        {metadata.map(item => (
                            <span key={item}>{item}</span>
                        ))}
                    </span>
                )}
            </span>
        </>
    );

    return (
        <article className={`moment-card${isPhoneCard ? ' moment-card-flip' : ''}${isFlipped ? ' is-flipped' : ''}`}>
            <button
                type="button"
                aria-label={isWished ? (t.labels?.removeFavorite ?? 'Remove from favorites') : (t.labels?.addFavorite ?? 'Save to favorites')}
                className={`moment-favorite-button ${isWished ? 'is-active' : ''}`}
                onClick={handleFavoriteToggle}
            >
                <span aria-hidden>{isWished ? '\u2665' : '\u2661'}</span>
            </button>

            {isPhoneCard ? (
                <div className="moment-card-flip-scene">
                    <div className="moment-card-face moment-card-face-front" aria-hidden={isFlipped}>
                        <div className="moment-card-main">
                            {frontContent}
                        </div>
                        <div className="moment-card-actions moment-card-actions-single">
                            <button
                                type="button"
                                className="moment-card-action moment-card-action-primary"
                                aria-expanded={isFlipped}
                                aria-controls={detailsId}
                                onClick={() => setIsFlipped(true)}
                            >
                                {cardLabels.viewDetails}
                            </button>
                        </div>
                    </div>

                    <div className="moment-card-face moment-card-face-back" id={detailsId} aria-hidden={!isFlipped}>
                        <div className="moment-card-back">
                            <div className="moment-card-back-copy">
                                <h3 className="moment-card-title">{name}</h3>
                                {detailCopy && <p className="moment-card-back-description">{detailCopy}</p>}
                                {address && <p className="moment-card-back-address">{address}</p>}
                            </div>

                            {phoneNumbers.length > 0 && (
                                <div className="moment-card-back-phones">
                                    {phoneNumbers.map(number => (
                                        <a
                                            key={number}
                                            href={telHref(number)}
                                            className="moment-card-phone-chip"
                                            tabIndex={isFlipped ? 0 : -1}
                                        >
                                            {number}
                                        </a>
                                    ))}
                                </div>
                            )}

                            <div className="moment-card-actions">
                                {primaryPhoneHref && (
                                    <a href={primaryPhoneHref} className="moment-card-action moment-card-action-primary" tabIndex={isFlipped ? 0 : -1}>
                                        {cardLabels.call}
                                    </a>
                                )}
                                {directionsHref && (
                                    <a
                                        href={directionsHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="moment-card-action"
                                        tabIndex={isFlipped ? 0 : -1}
                                    >
                                        {cardLabels.directions}
                                    </a>
                                )}
                                {website && (
                                    <a
                                        href={website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="moment-card-action"
                                        tabIndex={isFlipped ? 0 : -1}
                                    >
                                        {cardLabels.website}
                                    </a>
                                )}
                                <button
                                    type="button"
                                    className="moment-card-action"
                                    tabIndex={isFlipped ? 0 : -1}
                                    onClick={() => setIsFlipped(false)}
                                >
                                    {cardLabels.back}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <Link href={href} className="moment-card-main" aria-label={(t.a11y?.viewDetailsFor ?? 'View details for {name}').replace('{name}', name)}>
                        {frontContent}
                    </Link>

                    <div className="moment-card-actions">
                        <Link href={href} className="moment-card-action moment-card-action-primary">
                            {cardLabels.viewDetails}
                        </Link>
                        {directionsHref && (
                            <a
                                href={directionsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="moment-card-action"
                                aria-label={(t.a11y?.openMapFor ?? 'Open map for {name}').replace('{name}', name)}
                            >
                                {t.map?.openMap ?? 'Open map'}
                            </a>
                        )}
                    </div>
                </>
            )}
        </article>
    );
}
