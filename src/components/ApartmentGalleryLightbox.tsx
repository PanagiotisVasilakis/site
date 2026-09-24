"use client";
import { useState, useCallback, useRef, useEffect, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';



type AltMap = Partial<Record<ApartmentPhotoWithAlt['altKey'], string>> | undefined;
type LightboxLabels = {
  title?: string;
  instructions?: string;
  counter?: string;
  prev?: string;
  next?: string;
  close?: string;
  resetZoom?: string;
  thumbnail?: string;
};
const DEFAULT_LIGHTBOX_LABELS: Required<LightboxLabels> = {
  title: 'Photo viewer',
  instructions: 'Photo viewer controls: Use arrow keys to navigate between images, Home/End keys to jump to first/last image, Escape to close viewer.',
  counter: 'Currently viewing image {current} of {total}.',
  prev: 'Previous image',
  next: 'Next image',
  close: 'Close viewer',
  resetZoom: 'Reset Zoom',
  thumbnail: 'View image {current} of {total}',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type SiblingState = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

interface Props {
  photos: ApartmentPhotoWithAlt[];
  alts: AltMap;
  locale?: string;
  labels?: LightboxLabels;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.95,
  })
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export default function ApartmentGalleryLightbox({ photos, alts, locale = 'en', labels }: Props) {
  const [open, setOpen] = useState(false);
  const [[page, direction], setPage] = useState([0, 0]);
  const [activeSequence, setActiveSequence] = useState<number[]>(photos.map((_, i) => i));
  const activeSequenceRef = useRef(activeSequence);

  // Update ref when state changes
  useEffect(() => { activeSequenceRef.current = activeSequence; }, [activeSequence]);

  // Derived state
  const activePhotos = useMemo(() => activeSequence.map(idx => photos[idx]).filter(Boolean), [activeSequence, photos]);
  const total = activePhotos.length;
  const index = total > 0 ? ((page % total) + total) % total : 0;
  const currentPhoto = activePhotos[index];

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevFocused = useRef<HTMLElement | null>(null);
  const instructionsId = useId();

  // Formatting utils
  const numberFormatter = useMemo(() => {
    try { return new Intl.NumberFormat(locale || 'en'); } catch { return new Intl.NumberFormat('en'); }
  }, [locale]);



  const resolvedLabels = useMemo(() => ({
    title: labels?.title ?? (locale === 'el' ? 'Προβολή φωτογραφιών' : DEFAULT_LIGHTBOX_LABELS.title),
    instructions: labels?.instructions ?? DEFAULT_LIGHTBOX_LABELS.instructions,
    counter: labels?.counter ?? DEFAULT_LIGHTBOX_LABELS.counter,
    prev: labels?.prev ?? DEFAULT_LIGHTBOX_LABELS.prev,
    next: labels?.next ?? DEFAULT_LIGHTBOX_LABELS.next,
    close: labels?.close ?? DEFAULT_LIGHTBOX_LABELS.close,
    resetZoom: labels?.resetZoom ?? (locale === 'el' ? 'Επαναφορά ζουμ' : DEFAULT_LIGHTBOX_LABELS.resetZoom),
    thumbnail: labels?.thumbnail ?? (locale === 'el' ? 'Προβολή εικόνας {current} από {total}' : DEFAULT_LIGHTBOX_LABELS.thumbnail),
  }), [labels, locale]);

  const counterDisplay = `${numberFormatter.format(index + 1)}/${numberFormatter.format(total)}`;

  // Actions
  const paginate = useCallback((newDirection: number) => {
    setPage([page + newDirection, newDirection]);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch { /* ignore */ }
    }
  }, [page]);

  const close = useCallback(() => {
    setOpen(false);
    // Persist last index
    try {
      const globalIndex = activeSequenceRef.current[index] ?? 0;
      localStorage.setItem('apartmentGalleryLastIndex', String(globalIndex));
    } catch { /* ignore */ }
  }, [index]);

  const show = useCallback((globalIndex: number, sequence?: number[]) => {
    const seq = sequence ?? photos.map((_, i) => i);
    setActiveSequence(seq);

    // Find position in the sequence
    const pos = seq.indexOf(globalIndex);
    const startPage = pos >= 0 ? pos : 0;

    setPage([startPage, 0]);
    setOpen(true);
  }, [photos]);

  // Event Listeners
  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent;
      const detail = event.detail;
      let startIndex = 0;
      let subset: number[] | undefined;

      if (typeof detail === 'number') startIndex = detail;
      else if (detail && typeof detail === 'object') {
        if (typeof detail.startIndex === 'number') startIndex = detail.startIndex;
        if (Array.isArray(detail.subset)) subset = detail.subset;
      }

      // If subset provided, filter valid indices
      const validSubset = Array.isArray(subset)
        ? subset.filter(i => Number.isInteger(i) && i >= 0 && i < photos.length)
        : undefined;

      // If subset exists use it, otherwise use all photos
      const sequence = validSubset?.length ? [...new Set(validSubset)] : photos.map((_, i) => i);

      // Fallback logic
      let targetIndex = startIndex;
      if (!validSubset && startIndex === 0) {
        // If generic open with no specific index, try to restore last
        try {
          const saved = localStorage.getItem('apartmentGalleryLastIndex');
          if (saved) targetIndex = parseInt(saved, 10);
        } catch { /* ignore */ }
      }

      show(targetIndex, sequence);
    };

    window.addEventListener('open-apartment-lightbox', handler);
    return () => window.removeEventListener('open-apartment-lightbox', handler);
  }, [photos, show]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') paginate(1);
      else if (e.key === 'ArrowLeft') paginate(-1);
      else if (e.key === 'Home') setPage([0, -1]);
      else if (e.key === 'End') setPage([total - 1, 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, paginate, total]);

  // Keep the modal isolated from the page, trap keyboard focus, and restore the
  // exact scroll/focus state when it closes.
  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    prevFocused.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const siblingStates: SiblingState[] = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.hasAttribute('inert'),
      }));
    for (const { element } of siblingStates) {
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
    }

    const originalDocumentOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const focusFirst = () => (closeButtonRef.current ?? getFocusable()[0] ?? dialog).focus();
    const focusTimer = window.setTimeout(focusFirst, 0);

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', handleTab);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('focusin', handleFocusIn);
      document.documentElement.style.overflow = originalDocumentOverflow;
      document.body.style.overflow = originalBodyOverflow;
      for (const { element, ariaHidden, inert } of siblingStates) {
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
        if (inert) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
      }
      prevFocused.current?.focus();
    };
  }, [open]);

  // Zoom state
  const [scale, setScale] = useState(1);
  const resetZoom = () => setScale(1);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={resolvedLabels.title}
          aria-describedby={instructionsId}
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
          ref={dialogRef}
          tabIndex={-1}
        >
          <p id={instructionsId} className="sr-only">{resolvedLabels.instructions}</p>
          {/* Controls Header */}
          <div className="flex items-center justify-between p-4 z-20 text-white bg-gradient-to-b from-black/60 to-transparent">
            <span className="font-mono text-sm opacity-80">{counterDisplay}</span>
            <div className="flex gap-2">
              {/* Reset zoom if zoomed in, otherwise standard controls can stay */}
              {scale > 1 && (
                <button type="button" onClick={resetZoom} className="px-3 py-1 bg-white/10 rounded-full text-xs hover:bg-white/20 transition">
                  {resolvedLabels.resetZoom}
                </button>
              )}
              <button ref={closeButtonRef} type="button" onClick={close} className="p-2 hover:bg-white/20 rounded-full transition" aria-label={resolvedLabels.close}>
                <span className="text-xl leading-none">✕</span>
              </button>
            </div>
          </div>

          {/* Main Stage */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center touch-none">

            {/* Nav Buttons (Desktop) */}
            <button
              type="button"
              className="absolute left-4 z-20 p-4 text-white/70 hover:text-white hover:bg-black/20 rounded-full transition hidden md:block"
              onClick={() => paginate(-1)}
              aria-label={resolvedLabels.prev}
            >
              ◀
            </button>
            <button
              type="button"
              className="absolute right-4 z-20 p-4 text-white/70 hover:text-white hover:bg-black/20 rounded-full transition hidden md:block"
              onClick={() => paginate(1)}
              aria-label={resolvedLabels.next}
            >
              ▶
            </button>

            {/* Image Slider */}
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={page}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = swipePower(offset.x, velocity.x);
                  if (swipe < -swipeConfidenceThreshold) {
                    paginate(1);
                  } else if (swipe > swipeConfidenceThreshold) {
                    paginate(-1);
                  }
                }}
                className="absolute w-full h-full flex items-center justify-center p-2 md:p-8"
                onClick={() => {
                  // Double tap like toggle
                  setScale(s => s > 1 ? 1 : 2.5);
                }}
              >
                <div
                  className="relative w-full h-full"
                  style={{
                    transform: `scale(${scale})`,
                    transition: 'transform 0.3s cubic-bezier(0.2,0,0.4,1)',
                    cursor: scale > 1 ? 'zoom-out' : 'zoom-in'
                  }}
                >
                  {currentPhoto && (
                    <Image
                      src={currentPhoto.src}
                      alt={(alts && alts[currentPhoto.altKey]) || currentPhoto.altKey}
                      fill
                      className="object-contain select-none"
                      sizes="100vw"
                      priority
                      quality={90}
                      draggable={false}
                    />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Thumbnails Footer */}
          <div className="h-20 bg-black/60 backdrop-blur-md overflow-x-auto flex items-center gap-2 px-4 z-20">
            {activePhotos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage([i, i > index ? 1 : -1])}
                className={`relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden transition-all ${i === index ? 'ring-2 ring-white scale-110 opacity-100' : 'opacity-50 hover:opacity-80'
                  }`}
                aria-label={resolvedLabels.thumbnail
                  .replace('{current}', numberFormatter.format(i + 1))
                  .replace('{total}', numberFormatter.format(total))}
                aria-current={i === index ? 'true' : undefined}
              >
                <Image
                  src={p.src}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              </button>
            ))}
          </div>

        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
