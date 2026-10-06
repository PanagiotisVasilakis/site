import type { CSSProperties } from 'react';
import Link from 'next/link';

import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

import FactCounters from './FactCounters';

/**
 * identity §8 FactStrip: six facts from the house data, overlapping the hero, and a link to the free
 * dates. It never shows a price (the hero has the only one, §0.3). Motion M6 (motion.css): the tiles
 * open like louvres once HomeRevealObserver marks the strip `is-in`, and the numbers count up (M34,
 * FactCounters; the markup holds the final numbers).
 * `inline` (§9.2 apartment page head): the same six facts as a plain list, without the overlap card,
 * the link cell or the motion (styled in apartment.css).
 */
export default function FactStrip({ locale, inline = false }: { locale: Locale; inline?: boolean }) {
  const t = getDictionary(locale).home.facts;
  const facts = t.items.map((fact, index) => (
    <li key={fact.label} className="fact" style={inline ? undefined : ({ '--i': index } as CSSProperties)}>
      <span className={fact.sign ? 'fact__num fact__num--sign' : 'fact__num'} aria-hidden={fact.sign ? true : undefined}>
        {fact.value}
        {fact.unit ? <small className="fact__unit">{fact.unit}</small> : null}
      </span>
      <span className="fact__label">{fact.label}</span>
    </li>
  ));

  if (inline) {
    return (
      <ul className="facts-inline" aria-label={t.label}>
        {facts}
      </ul>
    );
  }

  return (
    <section className="facts" aria-label={t.label} data-reveal>
      <ul className="facts__list">{facts}</ul>
      <FactCounters />
      <p className="facts__more" style={{ '--i': t.items.length } as CSSProperties} data-cta-watch>
        <Button asChild variant="link-arrow">
          <Link href={`/${locale}/availability`}>
            {t.seeDates}
            <Icon name="arrow-right" size={20} className="ui-btn__arrow" />
          </Link>
        </Button>
      </p>
    </section>
  );
}
