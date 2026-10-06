"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';

import { Chip } from '@/components/ui/Chip';
import { isMotionFull } from '@/lib/motion/motionPreference';

import type { HomeRoom } from './homeRooms';

type RoomsShowcaseProps = Readonly<{
  rooms: readonly HomeRoom[];
  chipsLabel: string;
  trackLabel: string;
}>;

const TRACK_ID = 'rooms-track';
/** After the row stops scrolling, the centred card becomes the active one. */
const SCROLL_SETTLE_MS = 120;
/** M12: the stage tilts toward the pointer by at most 6°. */
const MAX_TILT_DEG = 6;

/**
 * identity §8 RoomsShowcase: room chips and a track of room cards. Below lg the track is a native
 * scroll-snap coverflow (M11, CSS only); from lg a fanned deck (M12). One card is active: the chips,
 * the arrow keys (Home/End too) and a first click move it; only the active card is in the tab order,
 * and Enter (or a click on it) follows its link to the room on the apartment page. The section head
 * is outside this component, so no transform ever touches it.
 */
export default function RoomsShowcase({ rooms, chipsLabel, trackLabel }: RoomsShowcaseProps) {
  const [active, setActive] = useState(0);
  const deck = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const settle = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    // Captions of inactive cards hide only once the active card can follow the scroll.
    if (deck.current) deck.current.dataset.live = '';
    return () => {
      window.clearTimeout(settle.current);
      window.cancelAnimationFrame(frame.current);
    };
  }, []);

  /** The coverflow scrolls sideways; the deck (≥ lg) does not. */
  const scrollable = (element: HTMLUListElement) => element.scrollWidth > element.clientWidth + 1;

  const centre = (index: number) => {
    const row = track.current;
    const card = row?.children[index];
    if (!row || !(card instanceof HTMLElement) || !scrollable(row)) return;
    row.scrollTo?.({
      left: card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2,
      behavior: isMotionFull() ? 'smooth' : 'auto',
    });
  };

  const select = (index: number, focus: boolean) => {
    setActive(index);
    centre(index);
    if (focus) links.current[index]?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = rooms.length - 1;
    const next = {
      ArrowRight: Math.min(active + 1, last),
      ArrowLeft: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, true);
  };

  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const row = track.current;
      if (!row) return;
      const middle = row.scrollLeft + row.clientWidth / 2;
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      Array.from(row.children).forEach((card, index) => {
        if (!(card instanceof HTMLElement)) return;
        const offset = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
        if (offset < distance) {
          distance = offset;
          nearest = index;
        }
      });
      setActive(nearest);
    }, SCROLL_SETTLE_MS);
  };

  const onCardClick = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (index === active) return;
    event.preventDefault();
    select(index, false);
  };

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const row = track.current;
    const stage = deck.current;
    if (!row || !stage || event.pointerType !== 'mouse' || !isMotionFull() || scrollable(row)) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      row.style.setProperty('--ry', `${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
      row.style.setProperty('--rx', `${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    });
  };

  const untilt = () => {
    window.cancelAnimationFrame(frame.current);
    track.current?.style.removeProperty('--rx');
    track.current?.style.removeProperty('--ry');
  };

  const middle = (rooms.length - 1) / 2;

  return (
    <>
      <div className="rooms__chips" role="group" aria-label={chipsLabel}>
        {rooms.map((room, index) => (
          <Chip key={room.key} pressed={index === active} aria-controls={TRACK_ID} onClick={() => select(index, false)}>
            {room.name}
          </Chip>
        ))}
      </div>
      <div ref={deck} className="rooms-deck" data-reveal onPointerMove={tilt} onPointerLeave={untilt}>
        <ul ref={track} id={TRACK_ID} className="rooms-track" aria-label={trackLabel} onKeyDown={onKeyDown} onScroll={onScroll}>
          {rooms.map((room, index) => {
            const position = index - middle;
            return (
              <li
                key={room.key}
                className={clsx('room-card', index === active && 'is-active')}
                style={{ '--pos': position, '--apos': Math.abs(position), '--z': Math.round(10 - Math.abs(position) * 2) } as CSSProperties}
              >
                <Link
                  ref={(element) => { links.current[index] = element; }}
                  href={room.href}
                  className="room-card__link"
                  tabIndex={index === active ? 0 : -1}
                  onClick={(event) => onCardClick(event, index)}
                >
                  <span className="room-card__3d" data-tilt>
                    <Image
                      className="room-card__img"
                      src={room.photo}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 330px, min(68vw, 300px)"
                      style={{ objectPosition: room.position }}
                    />
                    <span className="room-card__cap">
                      <span className="room-card__n" aria-hidden="true">{room.number}</span>
                      <span className="room-card__name">{room.name}</span>
                      <span className="room-card__line">{room.line}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
