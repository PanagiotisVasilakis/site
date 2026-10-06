// The six home room cards (identity §7.3, §8 RoomsShowcase): the lead photo of each room from the
// apartment photo data. A room whose lead photo is not in the data is left out, chip and card.

import type { HousePhotoRoomKey } from '@/data/housePhotos';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { HomeRoomKey } from '@/i18n/domains/home';

export type HomeRoom = Readonly<{
  key: HomeRoomKey;
  /** '01'…: the card's position among the rooms shown. */
  number: string;
  name: string;
  line: string;
  photo: string;
  /** object-position of the lead photo in the portrait card (§7.3 crops). */
  position: string;
  /** /{l}/apartment#<room>: the apartment page's room section ids (R3-V6). */
  href: string;
}>;

const HOME_ROOMS: ReadonlyArray<Readonly<{
  key: HomeRoomKey;
  photoRoom: HousePhotoRoomKey;
  photo: string;
  position: string;
  anchor: string;
}>> = [
  { key: 'living', photoRoom: 'living', photo: '/house/living/living_8.jpeg', position: '42% 50%', anchor: 'living' },
  { key: 'kitchen', photoRoom: 'kitchen', photo: '/house/kitchen/kitchen_2.jpeg', position: '45% 50%', anchor: 'kitchen' },
  // §7.3: crop the lace curtain on the left.
  { key: 'bedroom1', photoRoom: 'bedroom', photo: '/house/bedroom/bedroom_1.jpeg', position: '62% 50%', anchor: 'bedroom-1' },
  { key: 'bedroom2', photoRoom: 'bedroom_2', photo: '/house/bedroom_2/bedroom_2_5.jpeg', position: '40% 50%', anchor: 'bedroom-2' },
  { key: 'bathroom', photoRoom: 'bathroom', photo: '/house/bathroom/bathroom_6.jpeg', position: '45% 50%', anchor: 'bathroom' },
  // §7.3: the table and chairs, so the card does not repeat the hero framing.
  { key: 'balcony', photoRoom: 'balcony', photo: '/house/balcony/balcony_1.jpeg', position: '70% 60%', anchor: 'balcony' },
];

export function homeRoomsFrom(locale: Locale, photosByRoom: Readonly<Record<HousePhotoRoomKey, readonly string[]>>): HomeRoom[] {
  const items = getDictionary(locale).home.rooms.items;
  return HOME_ROOMS
    .filter((room) => photosByRoom[room.photoRoom].includes(room.photo))
    .map((room, index) => ({
      key: room.key,
      number: String(index + 1).padStart(2, '0'),
      name: items[room.key].name,
      line: items[room.key].line,
      photo: room.photo,
      position: room.position,
      href: `/${locale}/apartment#${room.anchor}`,
    }));
}
