"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Segmented, segmentedItemClass } from '@/components/ui/Segmented';
import { isMotionFull } from '@/lib/motion/motionPreference';

import type { Season } from './homeSeason';

type SeasonPanel = Readonly<{ label: string; link: string; href: string; cards: readonly ReactNode[] }>;

type SeasonHighlightsProps = Readonly<{
  groupLabel: string;
  listId: string;
  initial: Season;
  panels: Readonly<Record<Season, SeasonPanel>>;
  /** The link-arrow icon, rendered by the server so the icon set stays out of this bundle. */
  arrow: ReactNode;
}>;

const SEASONS: readonly Season[] = ['summer', 'winter'];
/** M9: each card flips 0 → 90° → 0 over 640 ms, 70 ms apart; its content swaps at the edge-on half. */
const FLIP_MS = 640;
const STAGGER_MS = 70;
/** M8: the pointer tilts a card by at most 6° on each axis. */
const MAX_TILT_DEG = 6;

/**
 * identity §8 SeasonSwitch + Highlights (graft 10). The switch controls the list (`aria-controls`),
 * and the list is a polite live region. Without motion (§5.2) the cards swap at once.
 */
export default function SeasonHighlights({ groupLabel, listId, initial, panels, arrow }: SeasonHighlightsProps) {
  const [selected, setSelected] = useState<Season>(initial);
  const [shown, setShown] = useState<Season[]>(() => panels[initial].cards.map(() => initial));
  const [flipping, setFlipping] = useState(false);
  const timers = useRef<number[]>([]);
  const frame = useRef(0);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    window.cancelAnimationFrame(frame.current);
  }, []);

  const choose = (season: Season) => {
    if (season === selected) return;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setSelected(season);
    const count = panels[season].cards.length;
    // A second change while the cards are still flipping swaps at once: the running flip cannot restart.
    if (!isMotionFull() || flipping) {
      setShown(Array.from({ length: count }, () => season));
      setFlipping(false);
      return;
    }
    setFlipping(true);
    for (let index = 0; index < count; index += 1) {
      timers.current.push(window.setTimeout(() => {
        setShown((current) => current.map((value, position) => (position === index ? season : value)));
      }, FLIP_MS / 2 + index * STAGGER_MS));
    }
    timers.current.push(window.setTimeout(() => setFlipping(false), FLIP_MS + (count - 1) * STAGGER_MS));
  };

  const tilt = (event: PointerEvent<HTMLUListElement>) => {
    if (event.pointerType !== 'mouse' || !isMotionFull()) return;
    const card = (event.target as Element).closest<HTMLElement>('.hl');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      card.style.setProperty('--tx', `${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
      card.style.setProperty('--ty', `${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    });
  };

  const untilt = (event: PointerEvent<HTMLUListElement>) => {
    const card = (event.target as Element).closest<HTMLElement>('.hl');
    if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    window.cancelAnimationFrame(frame.current);
    card.style.removeProperty('--tx');
    card.style.removeProperty('--ty');
  };

  const current = panels[selected];

  return (
    <div className="highlights-block">
      <Segmented label={groupLabel} className="season-switch">
        {SEASONS.map((season) => (
          <button
            key={season}
            type="button"
            className={segmentedItemClass}
            aria-pressed={season === selected}
            aria-controls={listId}
            onClick={() => choose(season)}
          >
            {panels[season].label}
          </button>
        ))}
      </Segmented>
      {/* The reveal observer marks this static wrapper; the list's own class changes while flipping. */}
      <div className="highlights-stage" data-reveal>
        <ul
          id={listId}
          className={flipping ? 'highlights is-flipping' : 'highlights'}
          aria-live="polite"
          aria-label={current.label}
          onPointerMove={tilt}
          onPointerOut={untilt}
        >
          {current.cards.map((_, index) => (
            <li key={index} className="hl" style={{ '--i': index } as CSSProperties}>
              {panels[shown[index] ?? selected].cards[index] ?? current.cards[index]}
            </li>
          ))}
        </ul>
      </div>
      <p className="highlights__more" data-cta-watch>
        <Button asChild variant="link-arrow">
          <Link href={current.href}>
            {current.link}
            {arrow}
          </Link>
        </Button>
      </p>
    </div>
  );
}
