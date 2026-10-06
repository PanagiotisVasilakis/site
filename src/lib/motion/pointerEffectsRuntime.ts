// Pointer-linked motion for fine pointers (docs/design/identity.md §5.5 M27 tilt + glare, M30 magnetic
// primary buttons; R3-V14), loaded by usePointerEffects (pointerEffects.ts) on fine-pointer devices only.
// One delegated listener on the document: `[data-tilt]` elements tilt toward the pointer (≤ 6°) and carry
// the glare position; `.ui-btn--primary` buttons are pulled toward it (≤ 6 px). It only writes custom
// properties and a `data-*-active` attribute, once per animation frame, from a box read when the pointer
// enters (no layout read per move). The CSS under the motion gate (motion.css, ui.css) turns them into
// transforms; leaving removes them and the transition springs back.
import { isMotionFull } from './motionPreference';

const MAX_TILT_DEG = 6;
const MAX_PULL_PX = 6;

const TILT_SELECTOR = '[data-tilt]';
const MAGNET_SELECTOR = '.ui-btn--primary';

type Box = Readonly<{ left: number; top: number; width: number; height: number }>;
type Slot = { element: HTMLElement | null; box: Box | null };

/** Pointer position inside a box as fractions (0…1), clamped. */
function fractions(box: Box, x: number, y: number): readonly [number, number] {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return [clamp((x - box.left) / (box.width || 1)), clamp((y - box.top) / (box.height || 1))];
}

/** The tilt toward the pointer: rotateY follows x, rotateX follows y (top edge comes forward). */
function tiltFor(box: Box, x: number, y: number): { rx: number; ry: number; gx: number; gy: number } {
  const [fx, fy] = fractions(box, x, y);
  return { rx: (0.5 - fy) * 2 * MAX_TILT_DEG, ry: (fx - 0.5) * 2 * MAX_TILT_DEG, gx: fx * 100, gy: fy * 100 };
}

/** The magnetic pull toward the pointer, at most MAX_PULL_PX on each axis. */
function pullFor(box: Box, x: number, y: number): { px: number; py: number } {
  const [fx, fy] = fractions(box, x, y);
  return { px: (fx - 0.5) * 2 * MAX_PULL_PX, py: (fy - 0.5) * 2 * MAX_PULL_PX };
}

const TILT_PROPS = ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y'] as const;
const PULL_PROPS = ['--pull-x', '--pull-y'] as const;

function release(slot: Slot, attribute: string, props: readonly string[]) {
  if (!slot.element) return;
  slot.element.removeAttribute(attribute);
  for (const prop of props) slot.element.style.removeProperty(prop);
  slot.element = null;
  slot.box = null;
}

/**
 * Attaches the delegated listeners to `doc`; returns the detach function. Nothing happens for non-mouse
 * pointer events (touch, pen) or while `data-motion` is not `full`.
 */
export function attachPointerEffects(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};

  const tilt: Slot = { element: null, box: null };
  const magnet: Slot = { element: null, box: null };
  let frame = 0;
  let x = 0;
  let y = 0;

  const releaseAll = () => {
    view.cancelAnimationFrame(frame);
    frame = 0;
    release(tilt, 'data-tilt-active', TILT_PROPS);
    release(magnet, 'data-magnet-active', PULL_PROPS);
  };

  const apply = () => {
    frame = 0;
    if (tilt.element && tilt.box) {
      const { rx, ry, gx, gy } = tiltFor(tilt.box, x, y);
      tilt.element.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`);
      tilt.element.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`);
      tilt.element.style.setProperty('--glare-x', `${gx.toFixed(1)}%`);
      tilt.element.style.setProperty('--glare-y', `${gy.toFixed(1)}%`);
    }
    if (magnet.element && magnet.box) {
      const { px, py } = pullFor(magnet.box, x, y);
      magnet.element.style.setProperty('--pull-x', `${px.toFixed(2)}px`);
      magnet.element.style.setProperty('--pull-y', `${py.toFixed(2)}px`);
    }
  };

  /** Points the slot at the element under the pointer, reading its box only when it changes. */
  const enter = (slot: Slot, element: HTMLElement | null, attribute: string, props: readonly string[]) => {
    if (slot.element === element) return;
    release(slot, attribute, props);
    if (!element || element.matches(':disabled, [aria-disabled="true"]')) return;
    const rect = element.getBoundingClientRect();
    slot.element = element;
    slot.box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    element.setAttribute(attribute, '');
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !isMotionFull()) {
      releaseAll();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    enter(tilt, target?.closest<HTMLElement>(TILT_SELECTOR) ?? null, 'data-tilt-active', TILT_PROPS);
    enter(magnet, target?.closest<HTMLElement>(MAGNET_SELECTOR) ?? null, 'data-magnet-active', PULL_PROPS);
    x = event.clientX;
    y = event.clientY;
    if (!frame && (tilt.element || magnet.element)) frame = view.requestAnimationFrame(apply);
  };

  const onOut = (event: PointerEvent) => {
    if (!event.relatedTarget) releaseAll(); // the pointer left the window
  };

  // A scroll moves the elements under a still pointer: their boxes are read again on the next move.
  const onScroll = () => releaseAll();

  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerout', onOut, { passive: true });
  view.addEventListener('scroll', onScroll, { passive: true, capture: true });
  return () => {
    releaseAll();
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerout', onOut);
    view.removeEventListener('scroll', onScroll, { capture: true });
  };
}
