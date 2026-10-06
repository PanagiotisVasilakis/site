import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons/Icon';
import { SharedElement } from '@/components/motion/SharedElement';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { GuideEntry } from './guideEntries';
import { SaveButton } from './SaveButton';

/** §7.3 art tile: band-bg with the band-accent category icon and the category name, for places without a photo. */
export function ArtTile({ entry, iconSize = 56 }: { entry: Pick<GuideEntry, 'icon' | 'categoryLabel'>; iconSize?: number }) {
  return (
    <span className="guide-art" aria-hidden>
      <Icon name={entry.icon} size={iconSize} className="guide-art__icon" />
      <span className="guide-art__label">{entry.categoryLabel}</span>
    </span>
  );
}

/** The meta line: category (olive) · straight-line distance, with its full meaning for screen readers. */
export function GuideMeta({ entry, locale, className }: { entry: GuideEntry; locale: string; className?: string }) {
  const t = getDictionary(normalizeLocale(locale));
  return (
    <p className={className ?? 'guide-meta'}>
      <span className="guide-meta__cat">{entry.categoryLabel}</span>
      {entry.distanceText ? (
        <>
          <span className="guide-meta__sep" aria-hidden>·</span>
          <span className="guide-meta__dist">
            <span aria-hidden>{entry.distanceText}</span>
            <span className="sr-only">{t.guide.distance.replace('{distance}', entry.distanceText)}</span>
          </span>
        </>
      ) : null}
    </p>
  );
}

/**
 * identity §8 GuideCard: 16:10 media (photo or art tile) with the shared element `guide-<slug>` (§5.7),
 * meta, title (one stretched link to the detail page), a two-line summary, and a footer with the external
 * Directions link and Save above the stretched link. `index` drives the calm-mode stagger (M25).
 * `titleAs` keeps the heading order of the page: h2 right under the page h1 (guide list, R-360), h3 under a
 * section h2 (detail "More nearby").
 */
export function GuideCard({ entry, locale, index = 0, priority = false, titleAs: Title = 'h3' }: { entry: GuideEntry; locale: string; index?: number; priority?: boolean; titleAs?: 'h2' | 'h3' }) {
  const t = getDictionary(normalizeLocale(locale));
  return (
    <article className="guide-card" style={{ '--i': index } as CSSProperties} data-tilt>
      <div className="guide-card__media">
        <SharedElement name={`guide-${entry.slug}`}>
          <div className="guide-card__frame">
            {entry.photo ? (
              <Image
                src={entry.photo}
                alt=""
                fill
                priority={priority}
                sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                className="guide-card__img"
                style={{ objectPosition: entry.photoPosition ?? 'center' }}
              />
            ) : (
              <ArtTile entry={entry} />
            )}
          </div>
        </SharedElement>
      </div>
      <div className="guide-card__body">
        <GuideMeta entry={entry} locale={locale} />
        <Title className="guide-card__title">
          <Link href={entry.href} className="guide-card__link shell-link">{entry.name}</Link>
        </Title>
        {entry.summary ? <p className="guide-card__summary">{entry.summary}</p> : null}
        <div className="guide-card__footer">
          {entry.directionsUrl ? (
            <a
              href={entry.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--link-arrow guide-card__directions"
            >
              {t.cta.directions}
              <Icon name="arrow-up-right" size={16} className="ui-btn__arrow" />
              <span className="sr-only">{t.guide.opensMaps}</span>
            </a>
          ) : <span />}
          <SaveButton id={entry.favoriteId} name={entry.name} locale={locale} />
        </div>
      </div>
    </article>
  );
}
