/**
 * Icon names (identity §6). Kept apart from `Icon.tsx` so content data and
 * zod schemas can validate names without importing React.
 *
 * `image` and `user` are not in the §6 list; they keep the two menu glyphs
 * (photo gallery, guest account) that the folded `MenuIcons.tsx` drew.
 */
export const ICON_NAMES = [
  // Navigation
  'arrow-right', 'arrow-left', 'arrow-up-right', 'chevron-left', 'chevron-right', 'chevron-down', 'close', 'menu',
  // Theme and language
  'sun', 'moon', 'motion',
  // Contact
  'phone', 'message', 'mail', 'camera', 'map-pin', 'directions', 'sos',
  // Stay facts
  'area', 'bed', 'bath', 'guests', 'stairs', 'parking', 'mountain', 'walk', 'car', 'bus', 'plane',
  // Amenities
  'wifi', 'snowflake', 'flame', 'kitchen', 'washer', 'dishwasher', 'tv', 'baby', 'key', 'lock', 'rules',
  // Guide
  'heart', 'heart-filled', 'search', 'filter', 'grid', 'map', 'compass', 'museum', 'beach', 'fork', 'star',
  // Status
  'info', 'check', 'alert', 'x-circle', 'clock', 'calendar',
  // Menu (from MenuIcons.tsx)
  'image', 'user',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
