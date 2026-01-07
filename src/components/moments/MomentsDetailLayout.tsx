import { Suspense } from 'react';
import { ResponsiveImage } from '@/components/ResponsiveImage';
import { CTAButton } from '@/components/CTAButton';
import { Skeleton } from '@/components/Skeleton';
import FavoriteButton from '@/components/FavoriteButton';
import ShareButton from '@/components/ShareButton';
import DescriptionBox from '@/components/DescriptionBox';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';

interface MomentsItem {
    id: string;
    name: string;
    summary?: string;
    image?: string;
    heroImage?: string;
    heroImagePosition?: string;
    tags?: string[];
    descriptionTitle?: string;
    description?: string;
}

interface MomentsDetailLayoutProps {
    item: MomentsItem;
    categorySlug: string;
    isRecentlyUpdated?: boolean;
    /** Pre-computed URLs - computed on server side */
    urls: {
        tel?: string;
        maps?: string;
        website?: string;
        reservationUrl?: string;
        schemaUrl: string;
    };
    translations: {
        cta: {
            call: string;
            directions: string;
            website: string;
            reserve: string;
        };
        labels?: {
            updated?: string;
        };
    };
}

/**
 * Centralized layout component for individual moments/places detail pages.
 * Provides consistent UI/UX across all places using momentsLayoutConfig.
 */
export function MomentsDetailLayout({
    item,
    categorySlug,
    isRecentlyUpdated,
    urls,
    translations,
}: MomentsDetailLayoutProps) {
    const config = momentsLayoutConfig.detail;
    const t = translations;

    return (
        <div className={config.containerClass}>
            {/* Structured Data */}
            <script
                type="application/ld+json"
                suppressHydrationWarning
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'Place',
                        name: item.name,
                        description: item.summary,
                        url: urls.schemaUrl,
                        image: item.image,
                    }),
                }}
            />

            {/* Header */}
            <header className={config.headerClass}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className={config.titleClass}>
                            {item.name}
                            {isRecentlyUpdated && (
                                <span className={momentsLayoutConfig.updatedBadge.class}>
                                    {t.labels?.updated ?? 'Updated'}
                                </span>
                            )}
                        </h1>
                        {item.summary && <p className={config.summaryClass}>{item.summary}</p>}
                    </div>
                </div>
            </header>

            {/* Hero Image */}
            {(item.heroImage || item.image) && (
                <Suspense fallback={<Skeleton className="w-full h-60" />}>
                    <ResponsiveImage
                        src={item.heroImage || item.image!}
                        alt={item.name}
                        width={1200}
                        height={800}
                        sizes="(max-width: 1280px) 100vw, 1280px"
                        className={config.imageClass}
                        objectPosition={item.heroImagePosition}
                        priority
                    />
                </Suspense>
            )}

            {/* CTA Buttons */}
            <div className={config.ctaGridClass}>
                {urls.tel && (
                    <CTAButton variant="primary" asChild aria-label={`${t.cta.call} ${item.name}`}>
                        <a href={urls.tel}>{t.cta.call}</a>
                    </CTAButton>
                )}
                {urls.maps && (
                    <CTAButton variant="primary" asChild aria-label={`${t.cta.directions} ${item.name}`}>
                        <a href={urls.maps} target="_blank">{t.cta.directions}</a>
                    </CTAButton>
                )}
                {urls.website && (
                    <CTAButton variant="primary" asChild aria-label={`${t.cta.website} ${item.name}`}>
                        <a href={urls.website} target="_blank">{t.cta.website}</a>
                    </CTAButton>
                )}
                {urls.reservationUrl && (
                    <CTAButton variant="primary" asChild aria-label={`${t.cta.reserve} ${item.name}`}>
                        <a href={urls.reservationUrl} target="_blank">{t.cta.reserve}</a>
                    </CTAButton>
                )}
                <ShareButton title={item.name} text={item.summary} className="btn-primary" />
                <FavoriteButton id={`${categorySlug}:${item.id}`} label={item.name} />
            </div>

            {/* Description */}
            <DescriptionBox title={item.descriptionTitle} description={item.description} />

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
                <div className={config.tagsContainerClass}>
                    {item.tags.map((tag) => (
                        <span key={tag} className={config.tagClass}>
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
