// The apartment page photo set (identity §7.3): 39 marketing photos per section (six rooms, then the details), in order, with the crops.
// Retired from public/ on 2026-10-11 (the owner keeps the files): living_1 (old entrance decor, now living_10),
// living_2 (branded packaging), bathroom_2 (toilet signs) and bathroom_8 (medicines). Removed earlier: living_3
// (branded packaging), living_1_booking, bedroom_4, bedroom_2_2, bedroom_2_4 and bathroom_5 (duplicates), bathroom_1
// (soft). living_9, living_10, living_11, bedroom_5, balcony_2, balcony_3 and details_1 to details_10 are the owner's photos
// of 2026-08-01, cut to 2:3.

/**
 * Section keys: the six rooms (linked from the home room cards), then the details section ('Up close', no home card).
 * They are also the section ids (`/{l}/apartment#bedroom-1`, `#details`).
 */
export const APARTMENT_ROOMS = ['living', 'kitchen', 'bedroom-1', 'bedroom-2', 'bathroom', 'balcony', 'details'] as const;
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
  // Owner exception of 2026-10-11 (identity §7.1): the brand labels on the dining table are blurred.
  { id: 'living_11', room: 'living', src: '/house/living/living_11.jpeg', width: 1280, height: 1920 },
  { id: 'living_7', room: 'living', src: '/house/living/living_7.jpeg', ...LANDSCAPE },
  { id: 'living_9', room: 'living', src: '/house/living/living_9.jpeg', width: 1280, height: 1920 },
  { id: 'living_10', room: 'living', src: '/house/living/living_10.jpeg', width: 1280, height: 1920 },
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
  { id: 'bedroom_5', room: 'bedroom-1', src: '/house/bedroom/bedroom_5.jpeg', width: 1280, height: 1920 },
  { id: 'bedroom_2_5', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_5.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_6', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_6.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_3', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_3.jpeg', ...LANDSCAPE },
  { id: 'bedroom_2_1', room: 'bedroom-2', src: '/house/bedroom_2/bedroom_2_1.jpeg', ...LANDSCAPE },
  { id: 'bathroom_6', room: 'bathroom', src: '/house/bathroom/bathroom_6.jpeg', ...LANDSCAPE },
  { id: 'bathroom_7', room: 'bathroom', src: '/house/bathroom/bathroom_7.jpeg', ...LANDSCAPE },
  { id: 'bathroom_3', room: 'bathroom', src: '/house/bathroom/bathroom_3.jpeg', ...PORTRAIT },
  { id: 'bathroom_4', room: 'bathroom', src: '/house/bathroom/bathroom_4.jpeg', width: 1280, height: 1920 },
  { id: 'balcony_2', room: 'balcony', src: '/house/balcony/balcony_2.jpeg', width: 1280, height: 1920 },
  // balcony_1 is also the master of the home hero crops and the share cards (identity §7.2).
  { id: 'balcony_1', room: 'balcony', src: '/house/balcony/balcony_1.jpeg', ...LANDSCAPE },
  { id: 'balcony_3', room: 'balcony', src: '/house/balcony/balcony_3.jpeg', width: 1280, height: 1920 },
  // Details ('Up close', identity §7.3): owner close-ups of 2026-08-01, all 2:3; no home card (homeRooms.ts).
  { id: 'details_1', room: 'details', src: '/house/details/details_1.jpeg', width: 1280, height: 1920 },
  { id: 'details_2', room: 'details', src: '/house/details/details_2.jpeg', width: 1280, height: 1920 },
  { id: 'details_3', room: 'details', src: '/house/details/details_3.jpeg', width: 1280, height: 1920 },
  { id: 'details_4', room: 'details', src: '/house/details/details_4.jpeg', width: 1280, height: 1920 },
  { id: 'details_5', room: 'details', src: '/house/details/details_5.jpeg', width: 1280, height: 1920 },
  { id: 'details_6', room: 'details', src: '/house/details/details_6.jpeg', width: 1280, height: 1920 },
  { id: 'details_7', room: 'details', src: '/house/details/details_7.jpeg', width: 1280, height: 1920 },
  { id: 'details_8', room: 'details', src: '/house/details/details_8.jpeg', width: 1280, height: 1920 },
  { id: 'details_9', room: 'details', src: '/house/details/details_9.jpeg', width: 1280, height: 1920 },
  { id: 'details_10', room: 'details', src: '/house/details/details_10.jpeg', width: 1280, height: 1920 },
] as const satisfies readonly ApartmentPhoto[];

export type ApartmentPhotoId = (typeof APARTMENT_PHOTOS)[number]['id'];

/** The page's lead photo; it opens the viewer at 1 / 39 and is not repeated in the Living tiles. */
export const APARTMENT_LEAD_PHOTO_ID: ApartmentPhotoId = 'living_8';
