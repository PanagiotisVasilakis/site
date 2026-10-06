import type { ReactNode } from 'react';

import { describeMonths, fill } from '@/components/availability/format';
import { Section } from '@/components/ui/Section';
import { CLIMATE_FEE_SCHEDULE } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import { climateFeeRuleOn } from '@/lib/availability/stayQuote';

/** The fee per season for the rule in force on `today`, as the availability page lists it. */
function climateFeeRates(today: IsoDate, locale: Locale): string[] {
  const t = getDictionary(locale).availability;
  const rule = climateFeeRuleOn(today, CLIMATE_FEE_SCHEDULE);
  if (!rule) return [];
  const low = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => !rule.highSeasonMonths.includes(month));
  return [
    { months: describeMonths(rule.highSeasonMonths, locale), cents: rule.highCents },
    { months: describeMonths(low, locale), cents: rule.lowCents },
  ]
    .filter((rate) => rate.months !== '')
    .map((rate) => fill(t.climateFeeRate, { months: rate.months, amount: formatCentsShort(rate.cents, locale) }));
}

/**
 * identity §8 FAQAccordion, §9.1 item 11: an exclusive accordion (`<details name="faq">`), the first item
 * open. The answers are the texts already shipped with the availability page and the check-in guide;
 * the children item appears only while the house data lists the family equipment.
 */
export default function FaqSection({ locale, today }: { locale: Locale; today: IsoDate }) {
  const t = getDictionary(locale);
  const q = t.home.faq;
  const fees = climateFeeRates(today, locale);
  const family = t.home.seasons.winter.cards.find((card) => card.icon === 'baby')?.text;

  const items: Array<{ key: string; question: string; answer: ReactNode }> = [
    { key: 'check-in', question: q.checkInOut, answer: <p className="faq__p">{t.availability.howToBook[2]} {q.arrivalTime} {t.checkinInfo.keysDetail}</p> },
    { key: 'parking', question: q.parking, answer: <p className="faq__p">{t.checkinInfo.parkingDetail}</p> },
    {
      key: 'climate-fee',
      question: q.climateFee,
      answer: (
        <>
          <p className="faq__p">{t.availability.climateFeeIntro}</p>
          {fees.length > 0 ? <ul className="faq__list">{fees.map((fee) => <li key={fee}>{fee}</li>)}</ul> : null}
        </>
      ),
    },
    {
      key: 'cancellation',
      question: q.cancellation,
      answer: (
        <>
          <ul className="faq__list">{t.availability.cancellation.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="faq__p">{t.availability.withdrawal}</p>
        </>
      ),
    },
    ...(family ? [{ key: 'children', question: q.children, answer: <p className="faq__p">{family}</p> }] : []),
  ];

  return (
    <Section id="faq" className="faq" title={q.title}>
      <div className="faq__items">
        {items.map((item, index) => (
          <details key={item.key} name="faq" className="faq__item" open={index === 0}>
            <summary className="faq__q">{item.question}</summary>
            <div className="faq__a">{item.answer}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
