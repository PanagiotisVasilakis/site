import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { housePhotosByRoom, type HousePhotoRoomKey } from '@/data/housePhotos';
import ApartmentCinematic from '@/components/ApartmentCinematic';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';
import type { Metadata } from 'next';
import { localizedAlternates, normalizeLocale } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const dictionary = getDictionary(eff);
  const title = dictionary.house?.title ?? (eff === 'el' ? 'Το διαμέρισμα' : 'The apartment');
  const description = dictionary.house?.intro ?? dictionary.homeSubtitle;
  return {
    title: `${title} | ${dictionary.appTitle}`,
    description,
    alternates: localizedAlternates(eff, '/apartment'),
    openGraph: {
      title,
      description,
      url: `/${eff}/apartment`,
      locale: eff,
      type: 'website',
      images: [{ url: '/house/balcony/balcony_1_hero.webp', alt: title }],
    },
  };
}

// Remove force-static to allow client components with dynamic imports
export const dynamic = 'auto';

export default async function ApartmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const t = getDictionary(eff);
  const ht = t.house; // reuse existing dictionary namespace

  const roomOrder: HousePhotoRoomKey[] = ['living','kitchen','bedroom','bedroom_2','balcony','bathroom'];
  const photos: ApartmentPhotoWithAlt[] = roomOrder.flatMap((room) =>
    housePhotosByRoom[room].map((src) => ({
      src,
      altKey: room,
    }))
  );

  // Custom hero image for the apartment page (balcony view)
  const heroPhoto: ApartmentPhotoWithAlt = {
    src: '/house/balcony/balcony_1.jpeg',
    altKey: 'balcony',
  };
  const photosWithHero = [heroPhoto, ...photos];

  return (
    <div className="cancel-top-gap">
      <ApartmentCinematic locale={eff} t={t} houseText={ht} photos={photosWithHero} />
    </div>
  );
}
