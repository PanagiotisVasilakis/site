// object-fit: cover and object-position as texture maths for the hero shader (identity §5.6).
// The shader maps a screen uv (0..1, top-left origin) to an image uv as `uv * scale + offset`.

export type HeroCover = readonly [scaleX: number, scaleY: number, offsetX: number, offsetY: number];

/**
 * The visible part of an iw × ih image in a cw × ch box under `object-fit: cover`, placed by
 * `object-position` px/py (0..1): the image is cropped on the axis where it is relatively longer.
 */
export function heroCover(cw: number, ch: number, iw: number, ih: number, px: number, py: number): HeroCover {
  const boxAspect = cw / ch;
  const imageAspect = iw / ih;
  let sx = 1;
  let sy = 1;
  if (boxAspect > imageAspect) sy = imageAspect / boxAspect;
  else sx = boxAspect / imageAspect;
  return [sx, sy, (1 - sx) * px, (1 - sy) * py];
}

/**
 * A computed `object-position` ("60% 40%") as fractions. Anything other than a percentage (keywords
 * are computed to percentages; lengths are not used by the hero) falls back to the centre.
 */
export function parseObjectPosition(value: string): readonly [number, number] {
  const [x, y] = value.trim().split(/\s+/);
  const fraction = (part: string | undefined) => (part !== undefined && part.endsWith('%') ? Number.parseFloat(part) / 100 : 0.5);
  const px = fraction(x);
  const py = fraction(y);
  return [Number.isFinite(px) ? px : 0.5, Number.isFinite(py) ? py : 0.5];
}
