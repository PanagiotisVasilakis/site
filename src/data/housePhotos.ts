export {};

export type HousePhotoRoomKey = 'living' | 'kitchen' | 'bedroom' | 'bedroom_2' | 'balcony' | 'bathroom';

export const housePhotosByRoom: Record<HousePhotoRoomKey, string[]> = {
  living: [
    '/house/living/living_1.jpeg',
    '/house/living/living_2.jpeg',
    '/house/living/living_3.jpeg',
    '/house/living/living_4.jpeg',
    '/house/living/living_5.jpeg',
    '/house/living/living_6.jpeg',
    '/house/living/living_7.jpeg',
    '/house/living/living_8.jpeg',
  ],
  kitchen: [
    '/house/kitchen/kitchen_1.jpeg',
    '/house/kitchen/kitchen_2.jpeg',
    '/house/kitchen/kitchen_3.jpeg',
    '/house/kitchen/kitchen_4.jpeg',
    '/house/kitchen/kitchen_5.jpeg',
    '/house/kitchen/kitchen_6.jpeg',
  ],
  bedroom: [
    '/house/bedroom/bedroom_1.jpeg',
    '/house/bedroom/bedroom_2.jpeg',
    '/house/bedroom/bedroom_3.jpeg',
    '/house/bedroom/bedroom_4.jpeg',
  ],
  bedroom_2: [
    '/house/bedroom_2/bedroom_2_1.jpeg',
    '/house/bedroom_2/bedroom_2_2.jpeg',
    '/house/bedroom_2/bedroom_2_3.jpeg',
    '/house/bedroom_2/bedroom_2_4.jpeg',
    '/house/bedroom_2/bedroom_2_5.jpeg',
    '/house/bedroom_2/bedroom_2_6.jpeg',
  ],
  balcony: ['/house/balcony/balcony_1.jpeg'],
  bathroom: [
    '/house/bathroom/bathroom_1.jpeg',
    '/house/bathroom/bathroom_2.jpeg',
    '/house/bathroom/bathroom_3.jpeg',
    '/house/bathroom/bathroom_4.jpeg',
    '/house/bathroom/bathroom_5.jpeg',
    '/house/bathroom/bathroom_6.jpeg',
    '/house/bathroom/bathroom_7.jpeg',
    '/house/bathroom/bathroom_8.jpeg',
  ],
};