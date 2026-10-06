import { Fragment } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Section } from '@/components/ui/Section';
import { CLIMATE_FEE_SCHEDULE, PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { propertyToday } from '@/lib/availability/calendarDate';

import { homeSeasonsOn, type Season } from './homeSeason';
import SeasonHighlights from './SeasonHighlights';

/**
 * identity §9.1 item 4: the intro (eyebrow, d2 title, lead) and the Summer/Winter highlights. The
 * default season is the season of the property's today, computed here on the server, so the page is
 * complete without JavaScript. The cards are rendered here and handed to the client switch as a keyed list.
 */
export default function Highlights({ locale, now }: { locale: Locale; now: Date }) {
  const t = getDictionary(locale).home;
  const seasons = homeSeasonsOn(propertyToday(PROPERTY_TIME_ZONE, now), CLIMATE_FEE_SCHEDULE);

  const panel = (season: Season, firstMonth: string) => {
    const copy = t.seasons[season];
    return {
      label: copy.label,
      link: copy.link,
      // The F09 fragment scheme: the availability page keeps its state in the fragment only.
      href: `/${locale}/availability#m=${firstMonth}`,
      cards: copy.cards.map((card) => (
        <Fragment key={card.title}>
          <span className="hl__icon"><Icon name={card.icon} /></span>
          <h3 className="hl__title">{card.title}</h3>
          <p className="hl__text">{card.text}</p>
        </Fragment>
      )),
    };
  };

  return (
    <Section
      id="intro"
      className="intro"
      eyebrow={t.intro.eyebrow}
      title={<>{t.intro.title} <em className="ui-section__em">{t.intro.titleEm}</em></>}
      lead={t.intro.lead}
    >
      {seasons ? (
        <SeasonHighlights
          groupLabel={t.seasons.label}
          listId="intro-highlights"
          initial={seasons.current}
          arrow={<Icon name="arrow-right" size={20} className="ui-btn__arrow" />}
          panels={{ summer: panel('summer', seasons.firstMonth.summer), winter: panel('winter', seasons.firstMonth.winter) }}
        />
      ) : null}
    </Section>
  );
}
