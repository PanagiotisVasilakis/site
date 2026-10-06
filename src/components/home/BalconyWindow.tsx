import Image from 'next/image';

import { Section } from '@/components/ui/Section';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/**
 * identity §8 BalconyWindow, §9.1 item 5: the balcony photo in a window frame and an italic quote.
 * The louvred shutters are decoration: hidden from assistive technology, and shown only under motion
 * (M10 in motion.css), where they swing open once the window is 45 % in view. Otherwise the photo
 * is simply there.
 */
export default function BalconyWindow({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.balcony;

  return (
    <Section id="balcony" className="balcony" eyebrow={t.eyebrow} title={t.title}>
      <div className="window" data-reveal="0.45">
        <div className="window__view">
          <Image
            className="window__img"
            src="/house/balcony/balcony_1.jpeg"
            alt={t.alt}
            fill
            sizes="(min-width: 1200px) 1080px, 92vw"
          />
        </div>
        <div className="window__light" aria-hidden="true" />
        <div className="shutter shutter--l" aria-hidden="true"><span className="shutter__knob" /></div>
        <div className="shutter shutter--r" aria-hidden="true"><span className="shutter__knob" /></div>
      </div>
      <blockquote className="balcony__quote">
        <p className="balcony__quote-text">{t.quote}</p>
      </blockquote>
    </Section>
  );
}
