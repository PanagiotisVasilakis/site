"use client";

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from '@/components/icons/Icon';
import { IconButton } from '@/components/ui/IconButton';

export type LightboxPhoto = Readonly<{ src: string; alt: string; caption: string }>;

export type LightboxLabels = Readonly<{
  dialog: string;
  close: string;
  previous: string;
  next: string;
  /** `{current}` and `{total}` are replaced. */
  counter: string;
}>;

type GalleryLightboxProps = {
  photos: readonly LightboxPhoto[];
  /** The photo to open at; `null` keeps the viewer closed. */
  openIndex: number | null;
  /** Escape, the close button or a native close: the caller sets `openIndex` back to null. */
  onRequestClose: (index: number) => void;
  labels: LightboxLabels;
};

/** The slide element for a photo, the morph target of `morphPhoto` (photoMorph.ts). */
export function lightboxSlide(index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.lightbox [data-index="${index}"]`);
}

function scrollBehavior(): ScrollBehavior {
  return document.documentElement.getAttribute('data-motion') === 'full' ? 'smooth' : 'instant';
}

/**
 * identity §8 GalleryLightbox: a full-screen modal <dialog> with a native scroll-snap track (a swipe is a
 * native scroll). Keys: Left/Right, Home/End, Escape. The counter follows `scrollend` (IntersectionObserver
 * where `scrollend` is missing) and is announced politely. Only the current photo and its neighbours load
 * eagerly. Focus returns to the element that opened it.
 */
export default function GalleryLightbox({ photos, openIndex, onRequestClose, labels }: GalleryLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRequestedRef = useRef(false);
  const [current, setCurrent] = useState(openIndex ?? 0);
  const [openedAt, setOpenedAt] = useState<number | null>(openIndex);
  const isOpen = openIndex !== null;
  const last = photos.length - 1;

  // A new opening starts at its photo (state adjusted during render, so the first commit is right).
  if (openIndex !== openedAt) {
    setOpenedAt(openIndex);
    if (openIndex !== null) setCurrent(openIndex);
  }

  // Layout effect: a View Transition update (flushSync) must leave the dialog open in the same task.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeRequestedRef.current = false;
      dialog.showModal();
      closeRef.current?.focus();
      const track = trackRef.current;
      track?.scrollTo({ left: openIndex * track.clientWidth, behavior: 'instant' });
    } else if (openIndex === null && dialog.open) {
      dialog.close();
    }
  }, [openIndex]);

  // The counter follows the track once a scroll settles.
  useEffect(() => {
    const track = trackRef.current;
    if (!isOpen || !track) return;
    if ('onscrollend' in window) {
      const onScrollEnd = () => {
        const width = track.clientWidth;
        if (width > 0) setCurrent(Math.min(Math.max(Math.round(track.scrollLeft / width), 0), last));
      };
      track.addEventListener('scrollend', onScrollEnd);
      return () => track.removeEventListener('scrollend', onScrollEnd);
    }
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.index));
      }
    }, { root: track, threshold: 0.6 });
    track.querySelectorAll('[data-index]').forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [isOpen, last]);

  // A focused previous/next button that disables itself at an end would drop focus to <body> (focus fixup),
  // outside the dialog's key handler: hand focus to the other button, or to the close button.
  useLayoutEffect(() => {
    const focused = [prevRef.current, nextRef.current].find((button) => button !== null && button === document.activeElement);
    if (!focused?.disabled) return;
    const other = focused === prevRef.current ? nextRef.current : prevRef.current;
    (other && !other.disabled ? other : closeRef.current)?.focus();
  }, [current]);

  const goTo = useCallback((index: number) => {
    const next = Math.min(Math.max(index, 0), last);
    setCurrent(next);
    const track = trackRef.current;
    track?.scrollTo({ left: next * track.clientWidth, behavior: scrollBehavior() });
  }, [last]);

  const requestClose = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onRequestClose(current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    switch (event.key) {
      case 'ArrowRight': goTo(current + 1); break;
      case 'ArrowLeft': goTo(current - 1); break;
      case 'Home': goTo(0); break;
      case 'End': goTo(last); break;
      case 'Escape': requestClose(); break;
      default: return;
    }
    event.preventDefault();
  };

  const counter = labels.counter.replace('{current}', String(current + 1)).replace('{total}', String(photos.length));

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-modal="true"
      aria-label={labels.dialog}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        // Escape: the same (possibly morphing) close as the close button.
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        // A close the caller did not ask for (e.g. a forced close request) still resets its state.
        if (!closeRequestedRef.current && openIndex !== null) requestClose();
        returnFocusRef.current?.focus();
        returnFocusRef.current = null;
      }}
    >
      {isOpen ? (
        <>
          <div className="lightbox__bar">
            <p className="lightbox__room">{photos[current]?.caption}</p>
            <p className="lightbox__count" aria-live="polite" aria-atomic="true">{counter}</p>
            <IconButton ref={closeRef} variant="on-photo" label={labels.close} onClick={requestClose}>
              <Icon name="close" size={20} />
            </IconButton>
          </div>
          <div ref={trackRef} className="lightbox__track">
            {photos.map((photo, index) => (
              <figure key={photo.src} className="lightbox__slide" data-index={index}>
                <Image
                  className="lightbox__img"
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="100vw"
                  loading={Math.abs(index - current) <= 1 ? 'eager' : 'lazy'}
                  draggable={false}
                />
              </figure>
            ))}
          </div>
          <IconButton
            ref={prevRef}
            className="lightbox__nav lightbox__nav--prev"
            variant="on-photo"
            label={labels.previous}
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            <Icon name="chevron-left" size={24} />
          </IconButton>
          <IconButton
            ref={nextRef}
            className="lightbox__nav lightbox__nav--next"
            variant="on-photo"
            label={labels.next}
            disabled={current === last}
            onClick={() => goTo(current + 1)}
          >
            <Icon name="chevron-right" size={24} />
          </IconButton>
        </>
      ) : null}
    </dialog>
  );
}
