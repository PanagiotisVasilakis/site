import type { ReactNode } from 'react';

import { Section } from '@/components/ui/Section';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/**
 * identity §8 FAQAccordion, §9.1 item 11: an exclusive accordion (`<details name="faq">`), the first item
 * open. The answers are the texts already shipped with the availability page and the check-in guide;
 * the children item appears only while the house data lists the family equipment.
 */
export default function FaqSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const q = t.home.faq;
  const family = t.home.seasons.winter.cards.find((card) => card.icon === 'baby')?.text;

  const items: Array<{ key: string; question: string; answer: ReactNode }> = [
    { key: 'check-in', question: q.checkInOut, answer: <p className="faq__p">{t.availability.howToBook[2]} {q.arrivalTime} {t.checkinInfo.keysDetail}</p> },
    { key: 'parking', question: q.parking, answer: <p className="faq__p">{t.checkinInfo.parkingDetail}</p> },
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
