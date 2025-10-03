import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { housePhotos, housePhotosByRoom, type HousePhotoRoomKey } from '@/data/housePhotos';
import ApartmentCinematic from '@/components/ApartmentCinematic';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';

// Remove force-static to allow client components with dynamic imports
export const dynamic = 'auto';

export default async function ApartmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const t = getDictionary(eff);
  const ht = t.house; // reuse existing dictionary namespace

  const roomOrder: HousePhotoRoomKey[] = ['living','kitchen','bedroom','balcony','bathroom'];
  const photos: ApartmentPhotoWithAlt[] = roomOrder.flatMap((room) =>
    housePhotosByRoom[room].map((photo) => ({
      ...photo,
      altKey: room,
    }))
  );

  return (
    <div className="cancel-top-gap">
      <ApartmentCinematic locale={eff} t={t} houseText={ht} photos={photos} />
    </div>
  );
}
