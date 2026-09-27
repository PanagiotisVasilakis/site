"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';
import ApartmentGalleryLightbox from '@/components/ApartmentGalleryLightbox';
import type { HouseDictionary } from '@/i18n/domains/house';

interface Props { locale: string; houseText: HouseDictionary; photos: ApartmentPhotoWithAlt[]; }

export default function ApartmentCinematic({ locale, houseText, photos }: Props) {
  const ht = houseText;
  const photoAlts: Partial<Record<ApartmentPhotoWithAlt['altKey'], string>> = ht.photoAlts;
  // Use locale directly instead of fragile Greek character detection
  const isGreek = locale === 'el';
  // hero scroll hint and skip intro labels were removed from the UI; keep properties available in `ht` for completeness
  const glanceTitle = ht.glanceTitle;
  const specsList = ht.specs;
  const ctaPrimaryText = ht.ctaPrimary;
  const ctaSecondaryText = ht.ctaSecondary;
  const footerNote = ht.footerNote;
  const photosRegionLabel = ht.navLabel;
  const specsSectionLabel = ht.specsSectionLabel;
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
    },
    {
      dictKey: 'kitchen' as const,
      bucket: 'kitchen' as const,
    },
    {
      dictKey: 'bedroom' as const,
      bucket: 'bedroom' as const,
    },
    {
      dictKey: 'bedroom_2' as const,
      bucket: 'bedroom_2' as const,
    },
    {
      dictKey: 'balcony' as const,
      bucket: 'balcony' as const,
    },
    {
      dictKey: 'bathroom' as const,
      bucket: 'bathroom' as const,
    },
  ]), []);
  const roomSections = React.useMemo(() => {
    return roomBlueprint.map((section) => {
      const primaryPool = buckets[section.bucket].length ? buckets[section.bucket] : defaultStack;
      const stack = primaryPool.slice(0, Math.min(primaryPool.length, 3));
      const { title: label, description } = ht.rooms[section.dictKey];
      return {
        ...section,
        label,
        description,
        stack,
        stackIndices: stack.map((entry) => entry.index),
      };
    });
  }, [buckets, defaultStack, ht, roomBlueprint]);
  const openGalleryAt = React.useCallback((index: number, subset?: number[]) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-apartment-lightbox', { detail: { startIndex: index, subset } }));
  }, []);
  return (
    <div className="relative apartment-cinematic-container">
      <section className="relative h-[90svh] md:h-[100svh] overflow-hidden" aria-label={ht.heroLabel}>
        <Image src={photos[0].src} alt={ht.title} fill priority loading="eager" fetchPriority="high" decoding="async" sizes="100vw" className="object-cover hero-ken-burns" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/40 to-black/20" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 flex h-full flex-col justify-center px-6 md:px-14 pt-20 md:pt-24 max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-serif italic font-bold apartment-hero-title text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.24), 0 8px 16px rgba(0,0,0,0.14), 0 16px 32px rgba(0,0,0,0.08)' }}>{ht.title}</h1>
          {/* Scroll hint and Skip intro removed as per design request */}
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 apartment-hero-bottom-fade" aria-hidden="true" />
      </section>
      <div id="apartment-content-start" className="relative apartment-content-section">
        <div className="h-10" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-6 md:px-14 py-14 lg:py-20 space-y-16" aria-label={photosRegionLabel} data-apartment-gallery-root>
          {roomSections.map(({ label, dictKey, description, stack, stackIndices }) => {
            const anchorId = `sec-${label.replace(/\s+/g, '-')}`;
            const openLabel = ht.openGallery.replace('{label}', isGreek ? label : label.toLowerCase());
            return (
              <article key={label} className="grid gap-8 lg:gap-16 xl:gap-24 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start scroll-mt-24" aria-labelledby={anchorId}>
                <div>
                  <h2 id={anchorId} className="text-2xl font-serif italic font-bold apartment-section-title">{label}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed apartment-description-text whitespace-pre-wrap break-words">
                    {description}
                  </p>
                </div>
                <div
                  className="apartment-photo-stack-wrapper"
                  data-room={dictKey}
                >
                  <div className="apartment-photo-stack" data-count={stack.length}>
                    {stack.map(({ photo, index: photoIndex }, idx) => (
                      <figure
                        key={`${photo.src}-${idx}`}
                        role="button"
                        aria-label={`${openLabel} ${idx + 1}`}
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
                            alt={photoAlts[photo.altKey] ?? photo.altKey}
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
            <h2 className="text-2xl font-serif italic font-bold apartment-section-title">{glanceTitle}</h2>
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
          alts={photoAlts}
          locale={locale}
          labels={ht.photoViewer}
        />
      </div>
    </div>
  );
}
