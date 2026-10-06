"use client";

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';

import type { ApartmentRoomKey, PhotoCrop } from '@/data/apartmentPhotos';
import GalleryLightbox, { lightboxSlide, type LightboxLabels, type LightboxPhoto } from './GalleryLightbox';
import { morphPhoto } from './photoMorph';

export type GalleryRoom = Readonly<{ key: ApartmentRoomKey; name: string; line: string }>;

export type GalleryPhoto = Readonly<{
  id: string;
  room: ApartmentRoomKey;
  src: string;
  width: number;
  height: number;
  crop?: PhotoCrop;
  alt: string;
}>;

type ApartmentGalleryProps = {
  rooms: readonly GalleryRoom[];
  /** Every photo in viewer order; the lead photo is shown above the rooms, not again among its tiles. */
  photos: readonly GalleryPhoto[];
  leadId: string;
  labels: Readonly<{ rooms: string; viewer: LightboxLabels }>;
};

// §9.2 layout widths: the container is min(1240px, 100vw - 2 gutters); masonry 2 / 3 (md) / 4 (xl) columns.
const LEAD_SIZES = '(min-width: 1368px) 1240px, 92vw';
const TILE_SIZES = '(min-width: 1368px) 300px, (min-width: 1280px) 23vw, (min-width: 768px) 30vw, 46vw';
const SINGLE_SIZES = '(min-width: 900px) 820px, 92vw';

/** A tile's box and object-position that cut `crop` off the frame with `object-fit: cover`. */
function cropStyle({ width, height, crop }: GalleryPhoto): { box: CSSProperties; img: CSSProperties } {
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop ?? {};
  const x = left + right > 0 ? (left / (left + right)) * 100 : 50;
  const y = top + bottom > 0 ? (top / (top + bottom)) * 100 : 50;
  return {
    box: { aspectRatio: `${Math.round(width * (1 - left - right))} / ${Math.round(height * (1 - top - bottom))}` },
    img: { objectPosition: `${x}% ${y}%` },
  };
}

/** The page element (lead photo or tile) that opens a photo: the morph target when the viewer closes. */
function galleryTile(index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.apt [data-photo="${index}"]`);
}

function inViewport(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight ? element : null;
}

/**
 * identity §9.2: the lead photo, the sticky room chips (the active chip follows the scroll), one section per
 * room (`id` = room key) with a CSS-columns masonry in the §7.3 order, and the GalleryLightbox over all photos.
 * Opening and closing morph between the tile and the viewer where View Transitions run (photoMorph.ts).
 */
export default function ApartmentGallery({ rooms, photos, leadId, labels }: ApartmentGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeRoom, setActiveRoom] = useState<ApartmentRoomKey>(rooms[0]?.key ?? 'living');
  const chipsRef = useRef<HTMLUListElement>(null);

  const leadIndex = photos.findIndex((photo) => photo.id === leadId);
  const lead = photos[leadIndex];
  const viewerPhotos = useMemo<LightboxPhoto[]>(() => photos.map((photo) => ({
    src: photo.src,
    alt: photo.alt,
    caption: rooms.find((room) => room.key === photo.room)?.name ?? '',
  })), [photos, rooms]);

  // The active chip: the first room section in the band just below the sticky chips.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      // Above the first room (page head, lead photo) the first chip is the current one.
      const firstSection = rooms[0] ? document.getElementById(rooms[0].key) : null;
      const aboveRooms = visible.size === 0 && firstSection !== null && firstSection.getBoundingClientRect().top > 0;
      const first = aboveRooms ? rooms[0] : rooms.find((room) => visible.has(room.key));
      if (!first) return;
      setActiveRoom(first.key);
      // Keep the active chip in view inside the sideways-scrolling row.
      const row = chipsRef.current;
      const chip = row?.querySelector<HTMLElement>(`[data-room="${first.key}"]`);
      if (row && chip) {
        const behavior = document.documentElement.getAttribute('data-motion') === 'full' ? 'smooth' : 'instant';
        row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior });
      }
    }, { rootMargin: '-140px 0px -55% 0px' });
    for (const room of rooms) {
      const section = document.getElementById(room.key);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [rooms]);

  const open = (index: number, tile: HTMLElement) => {
    morphPhoto(tile, () => lightboxSlide(index), () => flushSync(() => setOpenIndex(index)));
  };

  const close = (index: number) => {
    morphPhoto(lightboxSlide(index), () => inViewport(galleryTile(index)), () => flushSync(() => setOpenIndex(null)));
  };

  return (
    <>
      {lead ? (
        <div className="apt-lead">
          <button
            type="button"
            className="apt-lead__open"
            aria-haspopup="dialog"
            data-photo={leadIndex}
            onClick={(event) => open(leadIndex, event.currentTarget)}
          >
            {/* Taller than the box by the top crop and anchored to its bottom: the top of the frame is cut. */}
            <span className="apt-lead__frame" style={{ height: `${100 / (1 - (lead.crop?.top ?? 0))}%` }}>
              <Image
                className="apt-lead__img"
                src={lead.src}
                alt={lead.alt}
                fill
                sizes={LEAD_SIZES}
                loading="eager"
                fetchPriority="high"
              />
            </span>
          </button>
        </div>
      ) : null}

      <nav className="apt-chips" aria-label={labels.rooms}>
        <ul ref={chipsRef} className="apt-chips__list">
          {rooms.map((room) => (
            <li key={room.key}>
              <a
                href={`#${room.key}`}
                className="ui-chip apt-chip shell-link"
                data-room={room.key}
                aria-current={room.key === activeRoom ? 'true' : undefined}
                onClick={() => setActiveRoom(room.key)}
              >
                {room.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {rooms.map((room) => {
        const tiles = photos
          .map((photo, index) => ({ photo, index }))
          .filter(({ photo, index }) => photo.room === room.key && index !== leadIndex);
        const single = tiles.length === 1;
        return (
          <section key={room.key} id={room.key} className="apt-room" aria-labelledby={`${room.key}-title`}>
            <div className="apt-room__head">
              <h2 id={`${room.key}-title`} className="apt-room__title">{room.name}</h2>
              <p className="apt-room__line">{room.line}</p>
            </div>
            <ul className={single ? 'apt-masonry apt-masonry--single' : 'apt-masonry'}>
              {tiles.map(({ photo, index }) => {
                const style = cropStyle(photo);
                return (
                  <li key={photo.id} className="apt-masonry__item">
                    <button
                      type="button"
                      className="apt-tile"
                      aria-haspopup="dialog"
                      data-photo={index}
                      style={style.box}
                      onClick={(event) => open(index, event.currentTarget)}
                    >
                      <Image
                        className="apt-tile__img"
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        sizes={single ? SINGLE_SIZES : TILE_SIZES}
                        loading="lazy"
                        style={style.img}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <GalleryLightbox photos={viewerPhotos} openIndex={openIndex} onRequestClose={close} labels={labels.viewer} />
    </>
  );
}
