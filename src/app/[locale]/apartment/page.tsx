import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { HomeRoomKey } from '@/i18n/domains/home';
import { APARTMENT_LEAD_PHOTO_ID, APARTMENT_PHOTOS, APARTMENT_ROOMS, type ApartmentRoomKey } from '@/data/apartmentPhotos';
import ApartmentAmenities from '@/components/apartment/ApartmentAmenities';
import ApartmentCta from '@/components/apartment/ApartmentCta';
import ApartmentGallery from '@/components/gallery/ApartmentGallery';
import FactStrip from '@/components/home/FactStrip';
import AvailabilityBookBar from '@/components/shell/AvailabilityBookBar';
import type { Metadata } from 'next';
import { logger } from '@/lib/logger-enterprise';
import { readPublicAvailability, type PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';

// The BookBar price comes from the availability read: rendered per request, like home and availability.
export const dynamic = 'force-dynamic';

/** The room names and lines are the home rooms showcase's (one source for both pages). */
const ROOM_COPY: Readonly<Record<ApartmentRoomKey, HomeRoomKey>> = {
  living: 'living',
  kitchen: 'kitchen',
  'bedroom-1': 'bedroom1',
  'bedroom-2': 'bedroom2',
  bathroom: 'bathroom',
  balcony: 'balcony',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const dictionary = getDictionary(eff);
  const title = dictionary.house.title;
  const description = dictionary.house.intro;
  return {
    title,
    description,
    alternates: localizedAlternates(eff, '/apartment'),
    openGraph: localizedOpenGraph(eff, '/apartment'),
  };
}

/** The availability data for the BookBar price (identity §1.4, §8), or null. */
async function apartmentAvailability(now: Date): Promise<PublicAvailability | null> {
  try {
    return await readPublicAvailability(now);
  } catch {
    // No details: the error may carry connection data. The page then shows no BookBar.
    logger.error('Apartment price could not be read');
    return null;
  }
}

/** identity §9.2: page head, lead photo, room chips and galleries, amenities, CTA, BookBar (§8). */
export default async function ApartmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const ht = t.house;
  const rooms = APARTMENT_ROOMS.map((key) => ({ key, ...t.home.rooms.items[ROOM_COPY[key]] }));
  const photos = APARTMENT_PHOTOS.map((photo) => ({ ...photo, alt: ht.photoAlts[photo.id] }));
  const availability = await apartmentAvailability(new Date());

  return (
    <div className="apt">
      {/* data-hero: the page's lead area for the BookBar (it shows once the head has left the view). */}
      <header className="apt-head" data-hero>
        <p className="apt-head__eyebrow">{ht.eyebrow}</p>
        <h1 className="apt-head__title">{ht.title}</h1>
        <p className="apt-head__lead">{ht.intro}</p>
        <FactStrip locale={eff} inline />
      </header>
      <ApartmentGallery
        rooms={rooms}
        photos={photos}
        leadId={APARTMENT_LEAD_PHOTO_ID}
        labels={{ rooms: ht.roomsNavLabel, viewer: ht.viewer }}
      />
      <ApartmentAmenities locale={eff} />
      <ApartmentCta locale={eff} />
      <AvailabilityBookBar availability={availability} locale={eff} />
    </div>
  );
}
