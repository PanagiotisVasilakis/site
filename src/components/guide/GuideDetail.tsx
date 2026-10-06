import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/icons/Icon';
import { SharedElement } from '@/components/motion/SharedElement';
import { Button } from '@/components/ui/Button';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { telHref } from '@/lib/contactLinks';
import { serializeJsonLd } from '@/lib/jsonLd';
import { ArtTile, GuideCard, GuideMeta } from './GuideCard';
import type { GuideEntry } from './guideEntries';
import { SaveButton } from './SaveButton';

interface GuideDetailProps {
  entry: GuideEntry;
  nearby: GuideEntry[];
  locale: Locale;
  backHref: string;
  backLabel: string;
  /** schema.org Place fields (identity unchanged from the former detail layout). */
  structuredData: Record<string, string | undefined>;
  nonce?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * identity §9.5 detail: back link; the 16:10 hero (radius-card below xl, a full-bleed band at xl) with the
 * shared element `guide-<slug>`; category and distance; H1 (d1); the summary lead; Directions (secondary,
 * external) and Save; the facts (address, phone buttons as tel:, website); the description; "More nearby"
 * as three GuideCards. No booking call to action.
 */
export function GuideDetail({ entry, nearby, locale, backHref, backLabel, structuredData, nonce }: GuideDetailProps) {
  const t = getDictionary(locale);
  return (
    <article className="guide-detail">
      <script
        nonce={nonce}
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />

      <p className="guide-detail__back">
        <Link href={backHref} className="ui-btn ui-btn--link-arrow guide-back">
          <Icon name="arrow-left" size={16} className="ui-btn__arrow" />
          {backLabel}
        </Link>
      </p>

      <div className="guide-detail__hero">
        <SharedElement name={`guide-${entry.slug}`}>
          <div className="guide-detail__frame">
            {entry.photo ? (
              <Image
                src={entry.photo}
                alt={entry.name}
                fill
                priority
                sizes="(min-width: 1280px) 100vw, (min-width: 1024px) 960px, 100vw"
                className="guide-detail__img"
                style={{ objectPosition: entry.photoPosition ?? 'center' }}
              />
            ) : (
              <ArtTile entry={entry} iconSize={88} />
            )}
          </div>
        </SharedElement>
      </div>

      <div className="guide-detail__main">
        <header className="guide-detail__head">
          <GuideMeta entry={entry} locale={locale} />
          <h1 className="guide-detail__title">{entry.name}</h1>
          {entry.summary ? <p className="guide-detail__lead">{entry.summary}</p> : null}
        </header>

        <div className="guide-detail__actions">
          {entry.directionsUrl ? (
            <Button asChild variant="secondary" size="md">
              <a href={entry.directionsUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="directions" size={18} />
                {t.cta.directions}
                <Icon name="arrow-up-right" size={16} />
                <span className="sr-only">{t.guide.opensMaps}</span>
              </a>
            </Button>
          ) : null}
          <SaveButton id={entry.favoriteId} name={entry.name} locale={locale} labelled />
        </div>

        {entry.address || entry.phones.length > 0 || entry.website ? (
          <dl className="guide-facts">
            {entry.address ? (
              <div className="guide-facts__row">
                <dt className="guide-facts__term">{t.map.address}</dt>
                <dd className="guide-facts__value">{entry.address}</dd>
              </div>
            ) : null}
            {entry.phones.length > 0 ? (
              <div className="guide-facts__row">
                <dt className="guide-facts__term">{t.map.phone}</dt>
                <dd className="guide-facts__value guide-facts__phones">
                  {entry.phones.map((number) => (
                    <Button key={number} asChild variant="secondary" size="sm">
                      <a href={telHref(number)}>
                        <Icon name="phone" size={16} />
                        {number}
                      </a>
                    </Button>
                  ))}
                </dd>
              </div>
            ) : null}
            {entry.website ? (
              <div className="guide-facts__row">
                <dt className="guide-facts__term">{t.cta.website}</dt>
                <dd className="guide-facts__value">
                  <a href={entry.website} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--link-arrow">
                    {hostOf(entry.website)}
                    <Icon name="arrow-up-right" size={16} className="ui-btn__arrow" />
                    <span className="sr-only">{t.guide.opensWebsite}</span>
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {entry.description ? (
          <div className="guide-detail__body">
            {entry.descriptionTitle ? <h2 className="guide-detail__subtitle">{entry.descriptionTitle}</h2> : null}
            <p className="guide-detail__text">{entry.description}</p>
          </div>
        ) : null}
      </div>

      {nearby.length > 0 ? (
        <section className="guide-nearby" aria-labelledby="guide-nearby-title">
          <h2 id="guide-nearby-title" className="guide-nearby__title">{t.guide.moreNearby}</h2>
          <div className="guide-grid">
            {nearby.map((other, index) => <GuideCard key={other.id} entry={other} locale={locale} index={index} />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
