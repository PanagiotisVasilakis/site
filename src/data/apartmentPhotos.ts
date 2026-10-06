// The apartment page photo set (identity §7.3): 25 marketing photos per room, in order, with the crops.
// Left out on purpose: living_3 (branded packaging), living_1_booking (duplicate), bedroom_4 (near-duplicate
// of bedroom_3), bedroom_2_2 and bedroom_2_4 (duplicates), bathroom_5 (duplicate), bathroom_1 (soft), and
// bathroom_8 / bathroom_2 (stay hub and house rules only).

/** Room keys; they are also the section ids (`/{l}/apartment#bedroom-1`, linked from the home rooms). */
export const APARTMENT_ROOMS = ['living', 'kitchen', 'bedroom-1', 'bedroom-2', 'bathroom', 'balcony'] as const;
export type ApartmentRoomKey = (typeof APARTMENT_ROOMS)[number];

/** Fractions of the frame cut off each side (§7.3 crops). */
export type PhotoCrop = Readonly<{ top?: number; right?: number; bottom?: number; left?: number }>;

export type ApartmentPhoto = Readonly<{
  id: string;
  room: ApartmentRoomKey;
  src: string;
  width: number;
  height: number;
  crop?: PhotoCrop;
}>;

const LANDSCAPE = { width: 1920, height: 1281 } as const;
const PORTRAIT = { width: 1281, height: 1920 } as const;

export const APARTMENT_PHOTOS = [
  // Living: living_8 is the page's lead photo (LCP); the blown lamp and the AC unit sit in the top 8 %.
  { id: 'living_8', room: 'living', src: '/house/living/living_8.jpeg', ...LANDSCAPE, crop: { top: .08 } },
  { id: 'living_6', room: 'living', src: '/house/living/living_6.jpeg', ...LANDSCAPE, crop: { bottom: .15 } },
  // The orange table corner fills the bottom-left of the frame.
  { id: 'living_2', room: 'living', src: '/house/living/living_2.jpeg', ...LANDSCAPE, crop: { bottom: .2 } },
  { id: 'living_7', room: 'living', src: '/house/living/living_7.jpeg', ...LANDSCAPE },
  { id: 'living_1', room: 'living', src: '/house/living/living_1.jpeg', width: 1440, height: 1920 },
  { id: 'living_4', room: 'living', src: '/house/living/living_4.jpeg', width: 1280, height: 1920 },
  { id: 'living_5', room: 'living', src: '/house/living/living_5.jpeg', ...LANDSCAPE },
  { id: 'kitchen_2', room: 'kitchen', src: '/house/kitchen/kitchen_2.jpeg', ...LANDSCAPE },
  { id: 'kitchen_6', room: 'kitchen', src: '/house/kitchen/kitchen_6.jpeg', ...LANDSCAPE },
  { id: 'kitchen_3', room: 'kitchen', src: '/house/kitchen/kitchen_3.jpeg', ...LANDSCAPE },
  { id: 'kitchen_4', room: 'kitchen', src: '/house/kitchen/kitchen_4.jpeg', ...PORTRAIT },
  { id: 'kitchen_5', room: 'kitchen', src: '/house/kitchen/kitchen_5.jpeg', ...PORTRAIT },
  { id: 'kitchen_1', room: 'kitchen', src: '/house/kitchen/kitchen_1.jpeg', ...PORTRAIT },
  // The lace curtain fills the left 20 %.
  { id: 'bedroom_1', room: 'bedroom-1', src: '/house/bedroom/bedroom_1.jpeg', width: 1920, height: 1280, crop: { left: .2 } },
  { id: 'bedroom_2', room: 'bedroom-1', src: '/house/bedroom/bedroom_2.jpeg', ...LANDSCAPE },
  { id: 'bedroom_3', room: 'bedroom-1', src: '/house/bedroom/bedroom_3.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_5', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_5.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_6', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_6.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_3', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_3.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_1', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_1.jpeg', ...LANDSCAPE },
  { id: 'bathroom_6', room: 'bathroom', src: '/house/bathroom/bathroom_6.jpeg', ...LANDSCAPE },
  { id: 'bathroom_7', room: 'bathroom', src: '/house/bathroom/bathroom_7.jpeg', ...LANDSCAPE },
  { id: 'bathroom_3', room: 'bathroom', src: '/house/bathroom/bathroom_3.jpeg', ...PORTRAIT },
  { id: 'bathroom_4', room: 'bathroom', src: '/house/bathroom/bathroom_4.jpeg', width: 1280, height: 1920 },
  { id: 'balcony_1', room: 'balcony', src: '/house/balcony/balcony_1.jpeg', ...LANDSCAPE },
] as const satisfies readonly ApartmentPhoto[];

export type ApartmentPhotoId = (typeof APARTMENT_PHOTOS)[number]['id'];

/** The page's lead photo; it opens the viewer at 1 / 25 and is not repeated in the Living tiles. */
export const APARTMENT_LEAD_PHOTO_ID: ApartmentPhotoId = 'living_8';
