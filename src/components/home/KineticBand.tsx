import { Fragment } from 'react';

import { Icon } from '@/components/icons/Icon';

/** The same two rows in both locales (identity §1.2); each row carries its own `lang`. */
const ROWS = [
  { lang: 'en', className: 'kinetic__row kinetic__row--a', words: ['Taygetos', 'Messinian Gulf', 'Kalamata'] },
  { lang: 'el', className: 'kinetic__row kinetic__row--b', words: ['Ταΰγετος', 'Μεσσηνιακός κόλπος', 'Καλαμάτα'] },
] as const;

/** Twice, so the row still fills the width at the far end of its scroll offset (M7). */
const REPEAT = 2;

/**
 * identity §8 KineticBand (graft 2): pure decoration, hidden from assistive technology; the places are
 * named elsewhere on the page. Motion M7 (motion.css) moves the rows with the scroll only.
 */
export default function KineticBand() {
  return (
    <div className="kinetic" aria-hidden="true">
      {ROWS.map((row) => (
        <p key={row.lang} className={row.className} lang={row.lang}>
          <span className="kinetic__text">
            {Array.from({ length: REPEAT }, (_, round) => row.words.map((word, index) => (
              <Fragment key={`${round}-${word}`}>
                {round + index > 0 ? ' ' : null}
                {word}{' '}
                <Icon name="star" className="kinetic__star" />
              </Fragment>
            )))}
          </span>
        </p>
      ))}
    </div>
  );
}
