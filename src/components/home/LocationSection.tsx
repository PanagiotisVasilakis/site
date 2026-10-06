import type { CSSProperties } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Section } from '@/components/ui/Section';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

import { HOME_POINT, reliefPins } from './homeRelief';
import ReliefTilt from './ReliefTilt';

const LAND = 'M0 0H1000V668C920 664 860 676 800 670 700 660 640 700 560 694 520 692 500 660 470 668 420 680 330 632 250 606 160 588 70 596 0 600Z';
const COAST = 'M0 600C70 596 160 588 250 606 330 632 420 680 470 668 500 660 520 692 560 694 640 700 700 660 800 670 860 676 920 664 1000 668';
/** Taygetos as four contour layers on the east edge (decoration; the label sits on them). */
const CONTOURS = [
  'M1000 560C950 540 905 500 880 440 852 372 842 300 850 230 858 150 890 80 930 30 948 10 972 0 1000 0Z',
  'M1000 470C962 450 935 412 922 360 905 296 905 228 918 170 930 112 956 62 990 20L1000 14Z',
  'M1000 360C975 345 960 318 954 280 946 232 950 186 964 146 974 116 988 94 1000 84Z',
  'M1000 270C986 262 979 246 977 226 975 204 980 186 990 172L1000 164Z',
];

const at = (point: { left: number; top: number }) => ({ left: `${point.left.toFixed(1)}%`, top: `${point.top.toFixed(1)}%` });

/**
 * identity §8 LocationRelief + DistanceList, §9.1 item 8. The numbered list is the source of truth; the
 * relief is an illustrated plan (role="img" with a text alternative) whose pins come from the guide's
 * map coordinates. Static, it is a flat plan; under motion (M14, M15) the layers rise, the stage tilts
 * and follows a fine pointer (ReliefTilt), and the waves drift with the scroll.
 */
export default function LocationSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.location;
  const numbers = new Map(t.distances.map((row, index) => [row.key, index + 1]));
  const pins = reliefPins(t.distances.map((row) => row.key), locale);

  return (
    <Section
      id="location"
      variant="band"
      className="location"
      eyebrow={t.eyebrow}
      title={<>{t.title} <em className="ui-section__em">{t.titleEm}</em></>}
      lead={t.lead}
    >
      <div className="location__grid">
        <ol className="distances" aria-label={t.distancesLabel}>
          {t.distances.map((row, index) => (
            <li key={row.key} className="distance">
              <span className="distance__n" aria-hidden="true">{index + 1}</span>
              <span className="distance__name">{row.name}</span>
              <span className="distance__val">{row.value}</span>
              <span className="distance__how">{row.how}</span>
            </li>
          ))}
        </ol>

        <figure className="relief-wrap" data-reveal>
          <div className="relief" role="img" aria-label={t.mapAlt} aria-describedby="location-map-note">
            <svg className="relief__layer relief__sea" style={{ '--z': 0 } as CSSProperties} viewBox="0 0 1000 788" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs>
                <pattern id="relief-waves" width="60" height="18" patternUnits="userSpaceOnUse">
                  <path d="M0 9c7.5 0 7.5-5 15-5s7.5 5 15 5 7.5-5 15-5 7.5 5 15 5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </pattern>
              </defs>
              <rect width="1000" height="788" className="relief__sea-fill" />
              <rect width="1120" height="788" x="-60" fill="url(#relief-waves)" className="relief__waves" />
              <text x="640" y="760" className="relief__gulf" textAnchor="middle">{t.gulf}</text>
            </svg>
            <svg className="relief__layer relief__land" style={{ '--z': 6 } as CSSProperties} viewBox="0 0 1000 788" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs>
                <pattern id="relief-streets" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
                  <path d="M0 0H46M0 0V46" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
                <clipPath id="relief-land-clip"><path d={LAND} /></clipPath>
              </defs>
              <path className="relief__land-fill" d={LAND} />
              <ellipse className="relief__oldtown" cx="690" cy="200" rx="110" ry="80" />
              <rect width="1000" height="788" fill="url(#relief-streets)" clipPath="url(#relief-land-clip)" className="relief__streets" />
              <path className="relief__coast" d={COAST} fill="none" />
              <path className="relief__road" d="M40 214C200 236 420 250 640 214 760 196 900 150 1000 120" fill="none" />
              <path className="relief__road" d="M612 321C630 420 600 520 560 694" fill="none" />
            </svg>
            {CONTOURS.map((d, index) => (
              <svg
                key={d}
                className={`relief__layer relief__contour relief__contour--${index + 1}`}
                style={{ '--z': 12 + index * 10 } as CSSProperties}
                viewBox="0 0 1000 788"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d={d} />
              </svg>
            ))}
            <div className="relief__layer relief__pins" style={{ '--z': 40 } as CSSProperties} aria-hidden="true">
              <span className="pin pin--peak" style={{ left: '86%', top: '30%' }}>
                <b className="pin__n"><Icon name="mountain" size={14} /></b>
                <span className="pin__label">{t.taygetos}</span>
              </span>
              {pins.map((pin) => {
                const row = t.distances.find((distance) => distance.key === pin.key);
                return (
                  <span key={pin.key} className="pin" style={at(pin)}>
                    <b className="pin__n">{numbers.get(pin.key)}</b>
                    <span className="pin__label">{row?.pin ?? row?.name}</span>
                  </span>
                );
              })}
              <span className="pin pin--home" style={at(HOME_POINT)}>
                <b className="pin__n"><Icon name="star" size={14} /></b>
                <span className="pin__label">{t.homePin}</span>
              </span>
            </div>
          </div>
          <figcaption id="location-map-note" className="relief__note">{t.mapNote}</figcaption>
        </figure>
      </div>
      <ReliefTilt />
    </Section>
  );
}
