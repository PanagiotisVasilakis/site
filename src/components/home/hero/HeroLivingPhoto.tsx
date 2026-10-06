import Image from 'next/image';
import Link from 'next/link';

import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { AIRBNB_LISTING_URL } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { formatCentsShort } from '@/lib/availability/money';
import { airbnbListingHref, isAirbnbListingUrl } from '@/lib/contactLinks';

import HeroGlIsland from './HeroGlIsland';

const DIR = '/house/balcony/hero/balcony-hero';

/** §7.2 art direction: 9:16 on phones, 4:5 up to 1023 px, 3:2 above; AVIF first, then WebP. */
const SOURCES = [
  { media: '(max-width: 639px)', crop: '9x16', widths: [[480, 480], [720, 721]] },
  { media: '(max-width: 1023px)', crop: '4x5', widths: [[800, 800], [1024, 1025]] },
  { media: undefined, crop: '3x2', widths: [[1440, 1440], [1920, 1920]] },
] as const;

function srcSet(crop: string, widths: readonly (readonly [label: number, width: number])[], ext: 'avif' | 'webp') {
  return widths.map(([label, width]) => `${DIR}-${crop}-${label}.${ext} ${width}w`).join(', ');
}

type HeroLivingPhotoProps = {
  locale: Locale;
  /** The lowest nightly price from the availability data (lowestNightlyPriceCents), or null. */
  fromPriceCents: number | null;
};

/**
 * The home hero (identity §5.6, §7.2, §9.1): the balcony photo as a server-rendered <picture> (the LCP
 * element), the scrim, the H1 and the booking CTAs. HeroGlIsland may later fade a WebGL canvas in
 * over the same photo; without it (no JS, reduced motion, weak device) this is the whole hero.
 */
export default function HeroLivingPhoto({ locale, fromPriceCents }: HeroLivingPhotoProps) {
  const t = getDictionary(locale);
  const [before, after] = t.home.heroPriceFrom.split('{price}');

  return (
    <section className="hero" data-hero aria-labelledby="hero-title">
      <div className="hero__stage">
        <div className="hero__media">
          <picture>
            {SOURCES.flatMap(({ media, crop, widths }) => (['avif', 'webp'] as const).map((ext) => (
              <source key={`${crop}-${ext}`} media={media} type={`image/${ext}`} srcSet={srcSet(crop, widths, ext)} sizes="100vw" />
            )))}
            <Image
              className="hero__img"
              src={`${DIR}-3x2-1920.webp`}
              alt={t.home.heroAlt}
              width={1920}
              height={1281}
              loading="eager"
              fetchPriority="high"
              unoptimized
              draggable={false}
            />
          </picture>
          <div className="hero__tint" aria-hidden="true" />
          <div className="hero__scrim" aria-hidden="true" />
        </div>

        <div className="hero__content">
          <h1 id="hero-title" className="hero__title" lang="it">
            <span className="hero__line">Dolce</span>{' '}
            <span className="hero__line hero__line--2">far niente</span>
          </h1>
          <p className="hero__lede">
            {t.home.heroTagline}{' '}
            <span className="hero__facts">{t.home.heroFacts}</span>
          </p>
          <div className="hero__actions">
            <p className="hero__price">
              {fromPriceCents === null ? t.home.heroPriceNone : (
                <>
                  {before}
                  <strong className="hero__price-value">{formatCentsShort(fromPriceCents, locale)}</strong>
                  {after}
                </>
              )}
            </p>
            <Button asChild variant="primary">
              <Link href={`/${locale}/availability`}>
                {t.shell.checkDates}
                <Icon name="arrow-right" size={20} />
              </Link>
            </Button>
            {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? (
              <Button asChild variant="glass">
                <a href={airbnbListingHref(AIRBNB_LISTING_URL)} target="_blank" rel="noopener noreferrer">
                  {t.availability.booking.airbnb}
                  <Icon name="arrow-up-right" size={20} />{' '}
                  <span className="sr-only">{t.availability.booking.opensInNewTab}</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="hero__hint" aria-hidden="true">
          <span className="hero__hint-line" />
          <span>{t.home.heroScroll}</span>
        </div>
      </div>
      <HeroGlIsland />
    </section>
  );
}
