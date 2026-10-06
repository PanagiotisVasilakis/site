"use client";

import { useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/icons/Icon';
import { useToast } from '@/components/Toast';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { useFavorites } from '@/lib/favorites';

const BURST_DOTS = 6;

/**
 * identity §8 GuideCard "Save": the favourite toggle. `aria-pressed` carries the state, so the accessible
 * name stays "Save {name}"; the icon is `heart` / `heart-filled` in primary-text. Turning it on plays the
 * M21 burst (6 dots and a heart pop, motion-gated in motion.css): the keyed burst element remounts per
 * toggle, so the CSS animation runs once without timers. `labelled` adds the visible "Save" text (detail).
 */
export function SaveButton({ id, name, locale, labelled = false }: { id: string; name: string; locale: string; labelled?: boolean }) {
  const t = getDictionary(normalizeLocale(locale));
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const [bursts, setBursts] = useState(0);
  const saved = isFavorite(id);

  const onClick = () => {
    toggle(id);
    if (!saved) setBursts((count) => count + 1);
    push(saved ? t.labels.removedFavorite : t.labels.addedFavorite);
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={t.guide.saveNamed.replace('{name}', name)}
      className={clsx('guide-save', labelled && 'guide-save--labelled', saved && 'is-saved')}
      onClick={onClick}
    >
      <span className="guide-save__icon" aria-hidden>
        <Icon name={saved ? 'heart-filled' : 'heart'} size={22} />
        {saved && bursts > 0 ? (
          <span key={bursts} className="guide-save__burst">
            {Array.from({ length: BURST_DOTS }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}
          </span>
        ) : null}
      </span>
      {labelled ? <span className="guide-save__text" aria-hidden>{t.guide.save}</span> : null}
    </button>
  );
}
