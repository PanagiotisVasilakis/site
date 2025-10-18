"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';
import ApartmentGalleryLightbox from '@/components/ApartmentGalleryLightbox';
import ExpandableText from '@/components/ExpandableText';

interface HouseText {
  title?: string;
  location?: string;
  intro?: string;
  photoAlts?: Record<string,string>;
  glanceTitle?: string;
  specs?: string[];
  ctaPrimary?: string;
  ctaSecondary?: string;
  rooms?: Partial<Record<'living_room' | 'kitchen' | 'bedroom' | 'bedroom_2' | 'balcony' | 'bathroom', { title?: string; description?: string }>>;
  photoViewer?: {
    instructions?: string;
    counter?: string;
    prev?: string;
    next?: string;
    close?: string;
  };
  [k: string]: unknown;
}
interface Props { locale: string; t: unknown; houseText: HouseText | undefined; photos: ApartmentPhotoWithAlt[]; }

export default function ApartmentCinematic({ locale, houseText, photos }: Props){
  const ht = React.useMemo(() => houseText || {}, [houseText]);
  const introStr = typeof ht?.intro === 'string' ? ht.intro : '';
  const isGreek = /[Α-Ωα-ω]/.test(introStr);
  // hero scroll hint and skip intro labels were removed from the UI; keep properties available in `ht` for completeness
  const glanceTitle = typeof ht?.glanceTitle === 'string' ? ht.glanceTitle : (isGreek ? 'Με μια Ματιά' : 'At a Glance');
  const specsList = Array.isArray(ht?.specs) && ht.specs.length > 0
    ? ht.specs
    : (isGreek
      ? ['2 υπνοδωμάτια','1 μπάνιο','2ος όροφος','75 τ.μ.','Θέα βουνό & θάλασσα','Δωρεάν πάρκινγκ']
      : ['2 bedrooms','1 bathroom','2nd floor','75 m²','Mountain & sea views','Free parking']);
  const ctaPrimaryText = typeof ht?.ctaPrimary === 'string' ? ht.ctaPrimary : (isGreek ? 'Κράτηση' : 'Book');
  const ctaSecondaryText = typeof ht?.ctaSecondary === 'string' ? ht.ctaSecondary : (isGreek ? 'Επικοινωνία' : 'Contact Us');
  const footerNote = typeof ht?.footerNote === 'string' ? ht.footerNote : (isGreek ? '© Διαμέρισμα Καλαμάτας' : '© Kalamata Apartment');
  const photosRegionLabel = typeof ht?.navLabel === 'string' ? ht.navLabel : (isGreek ? 'Φωτογραφίες Διαμερίσματος' : 'Apartment photos');
  const specsSectionLabel = isGreek ? 'Προδιαγραφές και ενέργειες' : 'Specifications and actions';
  type GalleryEntry = { photo: ApartmentPhotoWithAlt; index: number };
  const entries = React.useMemo<GalleryEntry[]>(() => photos.map((photo, index) => ({ photo, index })), [photos]);
  const buckets = React.useMemo<Record<ApartmentPhotoWithAlt['altKey'], GalleryEntry[]>>(() => {
    return entries.reduce((acc, entry) => {
      const list = acc[entry.photo.altKey] || (acc[entry.photo.altKey] = []);
      list.push(entry);
      return acc;
    }, {
      living: [] as GalleryEntry[],
      kitchen: [] as GalleryEntry[],
      bedroom: [] as GalleryEntry[],
      bedroom_2: [] as GalleryEntry[],
      balcony: [] as GalleryEntry[],
      bathroom: [] as GalleryEntry[],
    });
  }, [entries]);
  const defaultStack = React.useMemo(() => entries.slice(0, 4), [entries]);
  const roomBlueprint = React.useMemo(() => ([
    {
      dictKey: 'living_room' as const,
      bucket: 'living' as const,
      fallbackTitle: { en: 'Living Room', el: 'Καθιστικό' },
      fallbackDescription: {
        en: 'An airy lounge with soft seating, daylight, and access to the balcony for relaxed gatherings.',
        el: 'Φωτεινό καθιστικό με άνετο καναπέ, ημέρας φως και πρόσβαση στο μπαλκόνι για στιγμές χαλάρωσης.'
      }
    },
    {
      dictKey: 'kitchen' as const,
      bucket: 'kitchen' as const,
      fallbackTitle: { en: 'Kitchen', el: 'Κουζίνα' },
      fallbackDescription: {
        en: 'Fully equipped with modern appliances and a breakfast nook for easy meals and morning coffee.',
        el: 'Πλήρως εξοπλισμένη με σύγχρονες ηλεκτρικές συσκευές και χώρο πρωινού για εύκολα γεύματα.'
      }
    },
    {
      dictKey: 'bedroom' as const,
      bucket: 'bedroom' as const,
      fallbackTitle: { en: 'Bedroom', el: 'Υπνοδωμάτιο' },
      fallbackDescription: {
        en: 'A calming retreat with plush bedding, blackout shades, and built-in storage for long stays.',
        el: 'Ήρεμο δωμάτιο με αναπαυτικό στρώμα, συσκότιση και ευρύχωρες ντουλάπες για μεγαλύτερες διαμονές.'
      }
    },
    {
      dictKey: 'bedroom_2' as const,
      bucket: 'bedroom_2' as const,
      fallbackTitle: { en: 'Second Bedroom', el: 'Δεύτερο Υπνοδωμάτιο' },
      fallbackDescription: {
        en: 'Comfortable second bedroom with ample space, perfect for families or groups.',
        el: 'Άνετο δεύτερο υπνοδωμάτιο με ευρύχωρο χώρο, ιδανικό για οικογένειες ή παρέες.'
      }
    },
    {
      dictKey: 'balcony' as const,
      bucket: 'balcony' as const,
      fallbackTitle: { en: 'Balcony', el: 'Μπαλκόνι' },
      fallbackDescription: {
        en: 'Open-air terrace capturing both mountain and sea breezes, perfect for sunset unwinding.',
        el: 'Ανοιχτός χώρος με δροσερό αεράκι βουνού και θάλασσας, ιδανικός για χαλάρωση στο ηλιοβασίλεμα.'
      }
    },
    {
      dictKey: 'bathroom' as const,
      bucket: 'bathroom' as const,
      fallbackTitle: { en: 'Bathroom', el: 'Μπάνιο' },
      fallbackDescription: {
        en: 'Bright bathroom with rainfall shower, premium amenities, and ample counter space.',
        el: 'Φωτεινό μπάνιο με ντους βροχής, ποιοτικά προϊόντα και άνετο πάγκο.'
      }
    },
  ]), []);
  const roomSections = React.useMemo(() => {
    return roomBlueprint.map((section) => {
      const primaryPool = buckets[section.bucket].length ? buckets[section.bucket] : defaultStack;
      const stack = primaryPool.slice(0, Math.min(primaryPool.length, 3));
      const roomCopy = ht?.rooms?.[section.dictKey];
      const label = typeof roomCopy?.title === 'string'
        ? roomCopy.title
        : (isGreek ? section.fallbackTitle.el : section.fallbackTitle.en);
      const description = typeof roomCopy?.description === 'string'
        ? roomCopy.description
        : (isGreek ? section.fallbackDescription.el : section.fallbackDescription.en);
      return {
        ...section,
        label,
        description,
        stack,
        stackIndices: stack.map((entry) => entry.index),
      };
    });
  }, [buckets, defaultStack, ht, isGreek, roomBlueprint]);
  const openGalleryAt = React.useCallback((index: number, subset?: number[]) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-apartment-lightbox', { detail: { startIndex: index, subset } }));
  }, []);
  return (
  <div className="relative apartment-cinematic-container">
  <section className="relative h-[90svh] md:h-[100svh] overflow-hidden" aria-label="Apartment hero">
        <Image src={photos[0].src} alt={ht?.title || 'Hero'} fill priority fetchPriority="high" decoding="async" sizes="100vw" className="object-cover hero-ken-burns" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/15" aria-hidden="true" />
  <div className="absolute inset-x-0 top-0 flex h-full flex-col justify-center px-6 md:px-14 pt-20 md:pt-24 text-white max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-semibold drop-shadow">{ht?.title || 'Seaside Modern Apartment'}</h1>
          <p className="mt-4 max-w-md text-lg opacity-90">{ht?.location || 'Aegean Bay, Greece'}</p>
          <p className="mt-6 max-w-lg text-base md:text-lg opacity-90">{ht?.intro || 'A cinematic coastal retreat with seamless indoor-outdoor living.'}</p>
          {/* Scroll hint and Skip intro removed as per design request */}
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>
  <div id="apartment-content-start" className="relative apartment-content-section">
        <div className="h-10" aria-hidden="true" />
  <div className="mx-auto max-w-6xl px-6 md:px-14 py-14 lg:py-20 space-y-16" aria-label={photosRegionLabel} data-apartment-gallery-root>
          {roomSections.map(({ label, dictKey, description, stack, stackIndices }) => {
            const anchorId = `sec-${label.replace(/\s+/g, '-')}`;
            const firstIndex = stackIndices[0] ?? 0;
            const openLabel = isGreek ? `Άνοιγμα γκαλερί ${label}` : `Open ${label.toLowerCase()} gallery`;
            return (
              <article key={label} className="grid gap-8 lg:gap-16 xl:gap-24 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start scroll-mt-24" aria-labelledby={anchorId}>
                <div>
                  <h2 id={anchorId} className="text-2xl font-semibold apartment-section-title">{label}</h2>
                  <ExpandableText
                    maxLines={4}
                    className="mt-3"
                    expandText={isGreek ? 'Περισσότερα' : 'Read more'}
                    collapseText={isGreek ? 'Λιγότερα' : 'Read less'}
                    disableClamp={isGreek}
                  >
                    <p className="text-[15px] leading-relaxed apartment-description-text">
                      {description}
                    </p>
                  </ExpandableText>
                </div>
                <div
                  className="apartment-photo-stack-wrapper"
                  role="button"
                  tabIndex={0}
                  aria-label={openLabel}
                  onClick={() => openGalleryAt(firstIndex, stackIndices)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar') {
                      event.preventDefault();
                      openGalleryAt(firstIndex, stackIndices);
                    }
                  }}
                  data-open-photo={firstIndex}
                  data-room={dictKey}
                >
                  <div className="apartment-photo-stack" role="presentation" data-count={stack.length}>
                    {stack.map(({ photo, index: photoIndex }, idx) => (
                      <figure
                        key={`${photo.src}-${idx}`}
                        role="presentation"
                        className="apartment-photo-stack-card"
                        data-layer={idx}
                        data-primary={idx === 0}
                        data-open-photo={photoIndex}
                        tabIndex={0}
                        onClick={() => openGalleryAt(photoIndex, stackIndices)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar') {
                            event.preventDefault();
                            openGalleryAt(photoIndex, stackIndices);
                          }
                        }}
                      >
                        <div className="apartment-photo-stack-frame">
                          <Image
                            src={photo.src}
                            alt={photo.altKey}
                            fill
                            sizes="(max-width:1024px) 100vw, 420px"
                            loading="lazy"
                            decoding="async"
                            className="object-cover"
                          />
                        </div>
                      </figure>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
          <section aria-label={specsSectionLabel} className="space-y-6">
            <h2 className="text-2xl font-semibold apartment-section-title">{glanceTitle}</h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {specsList.map(spec => <li key={spec} className="px-3 py-1 rounded-full apartment-spec-badge">{spec}</li>)}
            </ul>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href={`/${locale}#book-now`}
                className="px-6 py-3 rounded-[20px] apartment-btn-primary apartment-btn-primary--depth text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black/50"
              >
                {ctaPrimaryText}
              </Link>
              <Link
                href={`/${locale}/phones`}
                className="px-6 py-3 rounded-[20px] apartment-btn-secondary apartment-btn-secondary--depth text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
              >
                {ctaSecondaryText}
              </Link>
            </div>
          </section>
          <footer className="pt-20 text-xs apartment-footer-text">{footerNote}</footer>
        </div>
  <ApartmentGalleryLightbox
          photos={photos}
          alts={ht?.photoAlts ? {
            living: ht.photoAlts.living || 'living',
            bedroom: ht.photoAlts.bedroom || 'bedroom',
            kitchen: ht.photoAlts.kitchen || 'kitchen',
            balcony: ht.photoAlts.balcony || 'balcony',
            bathroom: ht.photoAlts.bathroom || 'bathroom',
          } : undefined}
          locale={locale}
          labels={ht?.photoViewer}
        />
      </div>
      <style jsx global>{`
        /* Apartment dark mode support */
        .apartment-cinematic-container {
          --apartment-ink: #1c1c20;
          --apartment-muted: #6e727a;
          --apartment-border: #e6e8ee;
        }
        [data-theme="dark"] .apartment-cinematic-container {
          --apartment-ink: var(--fg-default);
          --apartment-muted: var(--fg-muted);
          --apartment-border: var(--border-soft);
        }
        .apartment-content-section {
          background: #ffffff;
          color: var(--apartment-ink);
        }
        [data-theme="dark"] .apartment-content-section {
          background: var(--layer-bg-subtle);
          color: var(--fg-default);
        }
        .apartment-section-title {
          color: var(--apartment-ink);
        }
        [data-theme="dark"] .apartment-section-title {
          color: var(--fg-default);
        }
        .apartment-description-text {
          color: var(--apartment-muted);
        }
        [data-theme="dark"] .apartment-description-text {
          color: var(--fg-muted);
        }
        .apartment-spec-badge {
          border: 1px solid var(--apartment-border);
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        [data-theme="dark"] .apartment-spec-badge {
          border: 1px solid var(--border-soft);
          background: var(--layer-surface);
          color: var(--fg-default);
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .apartment-btn-primary {
          background: #000000;
          color: #ffffff;
        }
        .apartment-btn-primary--depth {
          box-shadow: 0 20px 36px -22px rgba(12, 20, 28, 0.6);
          transition: box-shadow 0.25s ease;
        }
        .apartment-btn-primary--depth:hover {
          box-shadow: 0 24px 44px -22px rgba(12, 20, 28, 0.64);
        }
        .apartment-btn-primary--depth:active {
          box-shadow: 0 16px 32px -24px rgba(12, 20, 28, 0.68);
        }
        [data-theme="dark"] .apartment-btn-primary {
          background: var(--brand-500);
          color: #042c28;
        }
        [data-theme="dark"] .apartment-btn-primary--depth {
          box-shadow: 0 18px 36px -22px rgba(14, 70, 60, 0.55);
        }
        [data-theme="dark"] .apartment-btn-primary--depth:hover {
          box-shadow: 0 24px 48px -24px rgba(14, 70, 60, 0.6);
        }
        .apartment-btn-secondary {
          background: #ffffff;
          border: 1px solid var(--apartment-border);
          color: var(--apartment-ink);
        }
        .apartment-btn-secondary--depth {
          box-shadow: 0 12px 28px -20px rgba(12, 20, 28, 0.45);
          transition: box-shadow 0.25s ease;
        }
        .apartment-btn-secondary--depth:hover {
          box-shadow: 0 16px 34px -22px rgba(12, 20, 28, 0.5);
        }
        .apartment-btn-secondary--depth:active {
          box-shadow: 0 10px 24px -24px rgba(12, 20, 28, 0.55);
        }
        [data-theme="dark"] .apartment-btn-secondary {
          background: var(--layer-surface);
          border: 1px solid var(--border-soft);
          color: var(--fg-default);
        }
        [data-theme="dark"] .apartment-btn-secondary--depth {
          box-shadow: 0 14px 36px -24px rgba(14, 70, 60, 0.45);
        }
        .apartment-footer-text {
          color: var(--apartment-muted);
        }
        [data-theme="dark"] .apartment-footer-text {
          color: var(--fg-muted);
        }

        .apartment-photo-stack-wrapper {
          position: relative;
          width: min(100%, 460px);
          margin-inline: auto;
          cursor: pointer;
          outline: none;
        }
        .apartment-photo-stack-wrapper:focus-visible {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-500, #14b8a6) 45%, transparent);
          border-radius: 28px;
        }
        @media (min-width: 1024px) {
          .apartment-photo-stack-wrapper {
            margin-inline: 0;
            margin-left: clamp(24px, 5vw, 72px);
          }
        }
        @media (min-width: 1440px) {
          .apartment-photo-stack-wrapper {
            margin-left: clamp(48px, 6vw, 120px);
          }
        }
        .apartment-photo-stack {
          position: relative;
          width: min(100%, 440px);
          min-height: clamp(280px, 46vw, 380px);
          margin-inline: auto;
          overflow: visible;
        }
        @media (min-width: 1024px) {
          .apartment-photo-stack { margin-inline: 0; }
        }
        .apartment-photo-stack-card {
          position: absolute;
          inset: 0;
          border-radius: 26px;
          overflow: hidden;
          border: 1px solid var(--apartment-border);
          background: color-mix(in srgb, var(--layer-surface, #ffffff) 92%, transparent);
          box-shadow: 0 24px 44px -24px rgba(12, 20, 28, 0.48);
          transition: transform 0.45s cubic-bezier(.22,.61,.36,1), box-shadow 0.35s ease, opacity 0.3s ease;
          cursor: pointer;
        }
        .apartment-photo-stack-card:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-500, #14b8a6) 45%, transparent);
        }
        .apartment-photo-stack-card[data-layer="0"] {
          transform: translate3d(0, 0, 0) scale(1);
          z-index: 4;
          opacity: 1;
        }
        .apartment-photo-stack-card[data-layer="1"] {
          transform: translate3d(18px, 20px, 0) scale(0.97);
          z-index: 3;
          opacity: 0.96;
        }
        .apartment-photo-stack-card[data-layer="2"] {
          transform: translate3d(32px, 40px, 0) scale(0.94);
          z-index: 2;
          opacity: 0.9;
        }
        .apartment-photo-stack-card[data-layer="3"] {
          transform: translate3d(46px, 58px, 0) scale(0.9);
          z-index: 1;
          opacity: 0.86;
        }
        .apartment-photo-stack-wrapper:hover .apartment-photo-stack-card[data-layer="0"],
        .apartment-photo-stack-wrapper:focus-visible .apartment-photo-stack-card[data-layer="0"] {
          transform: translate3d(-6px, -8px, 0) scale(1.015);
          box-shadow: 0 28px 50px -22px rgba(12, 20, 28, 0.55);
        }
        @media (hover: hover) {
          .apartment-photo-stack-wrapper:hover .apartment-photo-stack-card[data-layer="1"] {
            transform: translate3d(12px, 14px, 0) scale(0.975);
          }
          .apartment-photo-stack-wrapper:hover .apartment-photo-stack-card[data-layer="2"] {
            transform: translate3d(24px, 32px, 0) scale(0.94);
          }
        }
        .apartment-photo-stack-frame {
          position: absolute;
          inset: 0;
        }
        .apartment-photo-stack-frame img {
          transition: transform 0.45s cubic-bezier(.22,.61,.36,1);
        }
        @media (hover: hover) {
          .apartment-photo-stack-wrapper:hover .apartment-photo-stack-frame img {
            transform: scale(1.05);
          }
        }
        @media (max-width: 640px) {
          .apartment-photo-stack {
            min-height: clamp(240px, 66vw, 340px);
          }
          .apartment-photo-stack-card[data-layer="1"] {
            transform: translate3d(12px, 14px, 0) scale(0.985);
          }
          .apartment-photo-stack-card[data-layer="2"] {
            transform: translate3d(20px, 26px, 0) scale(0.95);
          }
          .apartment-photo-stack-card[data-layer="3"] {
            transform: translate3d(28px, 38px, 0) scale(0.92);
          }
        }
        @supports (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan linear both; animation-timeline: scroll(root block); animation-range: 0 65%; }
        }
        @supports not (animation-timeline: scroll()) {
          .hero-ken-burns { animation: heroPan 2s ease-out forwards; }
        }
        @keyframes heroPan { from { transform: scale(1); } to { transform: scale(1.03); } }
        @media (prefers-reduced-motion: reduce) {
          .hero-ken-burns { animation:none !important; transform:none !important; }
          .apartment-photo-stack-card,
          .apartment-photo-stack-frame img { transition:none !important; }
        }
      `}</style>
    </div>
  );
}
