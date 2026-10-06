// The capability gate of the WebGL hero (docs/design/identity.md §5.6, loading step 3): a pure check
// run after load and idle. Any reason returned aborts the living photograph; the photo stays.

export type HeroGateReason = 'reduced-motion' | 'save-data' | 'low-memory' | 'low-cpu' | 'hidden' | 'not-in-view';

type GateNavigator = Readonly<{
  hardwareConcurrency?: number;
  /** Chromium only; undefined means unknown, not a fail. */
  deviceMemory?: number;
  connection?: Readonly<{ saveData?: boolean }>;
}>;

type GateDocument = Readonly<{
  visibilityState: DocumentVisibilityState;
  documentElement: Readonly<{ dataset: DOMStringMap; clientHeight: number; clientWidth: number }>;
}>;

type GateElement = Readonly<{ getBoundingClientRect(): Readonly<{ top: number; bottom: number; left: number; right: number }> }>;

/** Null when every condition holds; otherwise the first failing one. */
export function heroGateFailure(nav: GateNavigator, doc: GateDocument, hero: GateElement): HeroGateReason | null {
  if (doc.documentElement.dataset.motion !== 'full') return 'reduced-motion';
  if (nav.connection?.saveData === true) return 'save-data';
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return 'low-memory';
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4) return 'low-cpu';
  if (doc.visibilityState !== 'visible') return 'hidden';
  const rect = hero.getBoundingClientRect();
  const { clientHeight, clientWidth } = doc.documentElement;
  if (rect.bottom <= 0 || rect.top >= clientHeight || rect.right <= 0 || rect.left >= clientWidth) return 'not-in-view';
  return null;
}

const HERO_DEPTH_MAPS = {
  '-9x16-': '/house/balcony/hero/depth-9x16.webp',
  '-4x5-': '/house/balcony/hero/depth-4x5.webp',
  '-3x2-': '/house/balcony/hero/depth-3x2.webp',
} as const;

/** The depth map cut like the crop the browser chose (identity §7.2), or null for an unknown source. */
export function heroDepthSrc(currentSrc: string): string | null {
  const match = Object.entries(HERO_DEPTH_MAPS).find(([marker]) => currentSrc.includes(marker));
  return match ? match[1] : null;
}
