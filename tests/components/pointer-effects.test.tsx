// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePointerEffects } from '@/lib/motion/pointerEffects';

// R3-V14 M27 (tilt + glare) and M30 (magnetic primary buttons): fine pointers only, full motion only.
function Harness({ enabled = true }: { enabled?: boolean }) {
  usePointerEffects(enabled);
  return (
    <>
      <article data-tilt data-testid="card"><span data-testid="inside">Card</span></article>
      <button type="button" className="ui-btn ui-btn--primary" data-testid="button">Check dates</button>
      <p data-testid="outside">Text</p>
    </>
  );
}

let frames: FrameRequestCallback[] = [];

function installPointer(fine: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: fine && media === '(hover: hover) and (pointer: fine)',
    media, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
  }) as MediaQueryList);
}

function box(element: HTMLElement, left: number, top: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  });
}

function move(target: HTMLElement, clientX: number, clientY: number, pointerType = 'mouse') {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    target.dispatchEvent(event);
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  });
}

async function setup(enabled = true) {
  const view = render(<Harness enabled={enabled} />);
  // The runtime is a lazily imported chunk (fine pointers only).
  await act(async () => { await vi.dynamicImportSettled(); });
  const card = view.getByTestId('card');
  const button = view.getByTestId('button');
  box(card, 0, 0, 200, 100);
  box(button, 0, 200, 100, 40);
  return { card, button, inside: view.getByTestId('inside'), outside: view.getByTestId('outside') };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
  installPointer(true);
  document.documentElement.setAttribute('data-motion', 'full');
});

describe('pointer effects (identity §5.5 M27, M30)', () => {
  it('tilts a [data-tilt] element toward the pointer by at most 6°, with the glare under it, and lets go when the pointer leaves', async () => {
    const { card, inside, outside } = await setup();
    move(inside, 200, 0); // top-right corner
    expect(card).toHaveAttribute('data-tilt-active');
    expect(card.style.getPropertyValue('--tilt-x')).toBe('6.00deg');
    expect(card.style.getPropertyValue('--tilt-y')).toBe('6.00deg');
    expect(card.style.getPropertyValue('--glare-x')).toBe('100.0%');
    expect(card.style.getPropertyValue('--glare-y')).toBe('0.0%');
    move(inside, 50, 75);
    expect(card.style.getPropertyValue('--tilt-x')).toBe('-3.00deg');
    expect(card.style.getPropertyValue('--tilt-y')).toBe('-3.00deg');

    move(outside, 500, 500);
    expect(card).not.toHaveAttribute('data-tilt-active');
    expect(card.style.getPropertyValue('--tilt-x')).toBe('');
  });

  it('pulls a primary button toward the pointer by at most 6 px', async () => {
    const { button } = await setup();
    move(button, 100, 240); // bottom-right corner
    expect(button).toHaveAttribute('data-magnet-active');
    expect(button.style.getPropertyValue('--pull-x')).toBe('6.00px');
    expect(button.style.getPropertyValue('--pull-y')).toBe('6.00px');
  });

  const ignored: Array<[label: string, arrange: () => void, pointerType: string]> = [
    ['a coarse-pointer device', () => installPointer(false), 'mouse'],
    ['a touch pointer', () => undefined, 'touch'],
    ['motion that is not full', () => document.documentElement.setAttribute('data-motion', 'reduce'), 'mouse'],
  ];
  it.each(ignored)('does nothing for %s', async (_label, arrange, pointerType) => {
    arrange();
    const { card, inside } = await setup();
    move(inside, 200, 0, pointerType);
    expect(card).not.toHaveAttribute('data-tilt-active');
    expect(card.style.getPropertyValue('--tilt-x')).toBe('');
  });

  it('is not mounted where the header turns it off (calm stay routes)', async () => {
    const { card, inside } = await setup(false);
    move(inside, 200, 0);
    expect(card).not.toHaveAttribute('data-tilt-active');
  });
});
