import Link from 'next/link';

import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { housePhotosByRoom } from '@/data/housePhotos';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

import { homeRoomsFrom } from './homeRooms';
import RoomsShowcase from './RoomsShowcase';

/** identity §9.1 item 6: "A slow walk through the rooms"; the head stays outside every transform. */
export default function RoomsSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.rooms;
  const rooms = homeRoomsFrom(locale, housePhotosByRoom);
  if (rooms.length === 0) return null;

  return (
    <Section id="rooms" className="rooms" eyebrow={t.eyebrow} title={t.title}>
      <RoomsShowcase rooms={rooms} chipsLabel={t.chipsLabel} trackLabel={t.trackLabel} />
      <p className="rooms__more">
        <Button asChild variant="link-arrow">
          <Link href={`/${locale}/apartment`}>
            {t.allPhotos}
            <Icon name="arrow-right" size={20} className="ui-btn__arrow" />
          </Link>
        </Button>
      </p>
    </Section>
  );
}
