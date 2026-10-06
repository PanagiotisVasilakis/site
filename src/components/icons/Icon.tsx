import type { ReactNode } from 'react';
import type { IconName } from './iconNames';

export type { IconName } from './iconNames';

/**
 * Line icon set (identity §6): 24x24, no fill, currentColor stroke 1.75,
 * round caps and joins, always decorative (`aria-hidden`). An icon-only
 * control must carry its own localized `aria-label`.
 */
const PATHS: Record<IconName, ReactNode> = {
  // Navigation
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  'chevron-left': <path d="m15 5.5-6 6.5 6 6.5" />,
  'chevron-right': <path d="m9 5.5 6 6.5-6 6.5" />,
  'chevron-down': <path d="m5.5 9 6.5 6 6.5-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // Theme and language
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  motion: <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M4 4l16 16" />,
  // Contact
  phone: <path d="M7.2 3.5 10 7.8 7.9 10a16.2 16.2 0 0 0 6.1 6.1l2.2-2.1 4.3 2.8-.8 3a2 2 0 0 1-2 1.5C9.4 20.5 3.5 14.6 2.7 6.3a2 2 0 0 1 1.5-2l3-.8Z" />,
  message: <path d="M20.5 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-4.4a8.5 8.5 0 1 1 15.6-4.6Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  camera: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  'map-pin': <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  directions: <path d="M12 2.5 21.5 12 12 21.5 2.5 12ZM9 14.5V11h5.5M12.5 8.5l2.5 2.5-2.5 2.5" />,
  sos: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>,
  // Stay facts
  area: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="m8 16 8-8M11.5 8H16v4.5" /></>,
  bed: <><path d="M3 6v12M3 14h18M21 18v-5.5a2.5 2.5 0 0 0-2.5-2.5H11v4" /><circle cx="7" cy="11" r="2" /></>,
  bath: <path d="M3.5 12h17v2.5a4.5 4.5 0 0 1-4.5 4.5H8a4.5 4.5 0 0 1-4.5-4.5ZM6 12V5.8a2 2 0 0 1 3.6-1.2M7 19l-1 2M17 19l1 2" />,
  guests: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
  stairs: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  parking: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5" /></>,
  mountain: <path d="M2.5 19h19l-6.5-10-3 4.5L9 8Z" />,
  walk: <><circle cx="13" cy="4.5" r="1.75" /><path d="M13.5 8 11 13.5l3 3 1 4.5M11 13.5 9 16l-1.5 5M12.5 9.5 9 11l-1 3M13.5 8l2 3.5 3 1" /></>,
  car: <><path d="M3 16v-3.5l2.2-5A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1l2.2 5V16h-1.5M4.5 16H3M9.5 16h5M3 12.5h18" /><circle cx="7" cy="16.5" r="2" /><circle cx="17" cy="16.5" r="2" /></>,
  bus: <><rect x="5" y="3" width="14" height="15" rx="2.5" /><path d="M5 11h14M5 7h14M8 18v2.5M16 18v2.5M8.5 14.5h.01M15.5 14.5h.01" /></>,
  plane: <path d="M21 15.5v-2l-8-5V4a1 1 0 0 0-2 0v4.5l-8 5v2l8-2.5V18l-2.5 2v1.5l3.5-1 3.5 1V20L13 18v-5Z" />,
  // Amenities
  wifi: <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />,
  snowflake: <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  flame: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2.5 2-3 4-3 6-1-.5-2-1.5-2.3-3C7 9.5 6 12 6 15a6 6 0 0 0 6 6Z" />,
  kitchen: <path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM2 10h2M20 10h2M9 6.5c0-1 1-1 1-2.5M14 6.5c0-1 1-1 1-2.5" />,
  washer: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><circle cx="12" cy="13.5" r="4.5" /><path d="M7.5 6h.01M10.5 6h.01" /></>,
  dishwasher: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M4 8h16M7.5 5.25h3M8 12v6M12 12v6M16 12v6" /></>,
  tv: <><rect x="2.5" y="5" width="19" height="13" rx="2" /><path d="M8 21h8M9 2.5 12 5l3-2.5" /></>,
  baby: <path d="M4 4v16M20 4v16M4 16h16M4 8h16M8 8v8M12 8v8M16 8v8" />,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8 20 3M16.5 6.5 19 9M14.5 8.5l2 2" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 15v2" /></>,
  rules: <><rect x="5" y="3.5" width="14" height="17.5" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  // Guide
  heart: <path d="M12 20.5s-8.5-5-8.5-11A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 3.1c0 6-8.5 11-8.5 11Z" />,
  'heart-filled': <path fill="currentColor" d="M12 20.5s-8.5-5-8.5-11A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 3.1c0 6-8.5 11-8.5 11Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  filter: <path d="M3.5 5h17l-6.5 8v6l-4 2v-8Z" />,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  map: <path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5ZM9 4v13.5M15 6.5V20" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>,
  museum: <path d="M3 9 12 4l9 5ZM5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20.5h18" />,
  beach: <path d="M3.5 11.5a8.5 8.5 0 0 1 17 0ZM12 11.5V19M3 20.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />,
  fork: <><path d="M7 3v7a3 3 0 0 1-3 3V3M7 3v18M17 3v18M17 3c2.2 2.1 3 4.3 3 6.5S18.7 13 17 13" /><circle cx="12" cy="10" r="2.5" /></>,
  star: <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />,
  // Status
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  check: <path d="M4 12.5 9 17l11-11" />,
  alert: <path d="M12 3.5 21.5 20h-19ZM12 10v4.5M12 17.5h.01" />,
  'x-circle': <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m8.5 15 2 2 5-5" /></>,
  // Menu (from MenuIcons.tsx)
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4.5 3.2 3.2 2.3-2.3 4 3.6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
};

export function Icon({ name, className, size = 24 }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
