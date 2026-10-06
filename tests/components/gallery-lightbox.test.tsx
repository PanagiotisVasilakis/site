// @vitest-environment jsdom

import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GalleryLightbox, { type LightboxPhoto } from '@/components/gallery/GalleryLightbox';

const PHOTOS: LightboxPhoto[] = [
  { src: '/a.jpeg', alt: 'Sofa', caption: 'Living room' },
  { src: '/b.jpeg', alt: 'Table', caption: 'Living room' },
  { src: '/c.jpeg', alt: 'Oven', caption: 'Kitchen' },
  { src: '/d.jpeg', alt: 'Bed', caption: 'Bedroom 1' },
  { src: '/e.jpeg', alt: 'Basin', caption: 'Bathroom' },
];

const LABELS = {
  dialog: 'Photo viewer',
  close: 'Close photo viewer',
  previous: 'Previous photo',
  next: 'Next photo',
  counter: '{current} / {total}',
};

const SLIDE_WIDTH = 800;

// jsdom has no HTMLDialogElement.showModal/close and no Element.scrollTo; these follow the spec's
// observable steps (open attribute, `close` event; scrollTo moves scrollLeft).
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    }),
  });
  scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? 0; });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => SLIDE_WIDTH });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

/** The page side: thumbnails that open the viewer at their index, like the apartment gallery. */
function Harness({ onRequestClose }: { onRequestClose?: (index: number) => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <>
      {PHOTOS.map((photo, index) => (
        <button key={photo.src} type="button" onClick={() => setOpenIndex(index)}>{`open ${photo.alt}`}</button>
      ))}
      <GalleryLightbox
        photos={PHOTOS}
        openIndex={openIndex}
        onRequestClose={(index) => {
          onRequestClose?.(index);
          setOpenIndex(null);
        }}
        labels={LABELS}
      />
    </>
  );
}

function counter(dialog: HTMLElement) {
  return dialog.querySelector('.lightbox__count');
}

async function openAt(alt: string) {
  const user = userEvent.setup();
  const opener = screen.getByRole('button', { name: `open ${alt}` });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Photo viewer' });
  return { user, opener, dialog };
}

describe('GalleryLightbox (identity §8)', () => {
  it('opens as a modal dialog at the chosen photo with an announced counter', async () => {
    render(<Harness />);
    const { dialog } = await openAt('Table');

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(counter(dialog)).toHaveTextContent('2 / 5');
    expect(counter(dialog)).toHaveAttribute('aria-live', 'polite');
    expect(counter(dialog)).toHaveAttribute('aria-atomic', 'true');
    expect(within(dialog).getByText('Living room')).toBeInTheDocument();
    // The track starts at the chosen photo.
    expect((dialog.querySelector('.lightbox__track') as HTMLElement).scrollLeft).toBe(SLIDE_WIDTH);
  });

  it('moves with Left/Right/Home/End and stops at both ends', async () => {
    render(<Harness />);
    const { dialog } = await openAt('Table');
    const track = dialog.querySelector('.lightbox__track') as HTMLElement;

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(counter(dialog)).toHaveTextContent('3 / 5');
    expect(track.scrollLeft).toBe(2 * SLIDE_WIDTH);
    expect(within(dialog).getByText('Kitchen')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'End' });
    expect(counter(dialog)).toHaveTextContent('5 / 5');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(counter(dialog)).toHaveTextContent('5 / 5');
    expect(track.scrollLeft).toBe(4 * SLIDE_WIDTH);

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(counter(dialog)).toHaveTextContent('4 / 5');

    fireEvent.keyDown(dialog, { key: 'Home' });
    expect(counter(dialog)).toHaveTextContent('1 / 5');
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(counter(dialog)).toHaveTextContent('1 / 5');
    expect(track.scrollLeft).toBe(0);
  });

  it('has previous/next buttons that are disabled at the ends', async () => {
    render(<Harness />);
    const { user, dialog } = await openAt('Sofa');

    expect(within(dialog).getByRole('button', { name: 'Previous photo' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Next photo' }));
    expect(counter(dialog)).toHaveTextContent('2 / 5');
    expect(within(dialog).getByRole('button', { name: 'Previous photo' })).toBeEnabled();
  });

  it('updates the counter when a swipe ends (scrollend)', async () => {
    render(<Harness />);
    const { dialog } = await openAt('Sofa');
    const track = dialog.querySelector('.lightbox__track') as HTMLElement;

    track.scrollLeft = 3 * SLIDE_WIDTH;
    act(() => { track.dispatchEvent(new Event('scrollend')); });
    expect(counter(dialog)).toHaveTextContent('4 / 5');
    expect(within(dialog).getByText('Bedroom 1')).toBeInTheDocument();
  });

  it('updates the counter from an IntersectionObserver where scrollend is missing', async () => {
    // Hide jsdom's `onscrollend` (wherever it sits on the window's prototype chain) for this test only.
    let owner: object | null = window;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, 'onscrollend')) owner = Object.getPrototypeOf(owner);
    const descriptor = owner ? Object.getOwnPropertyDescriptor(owner, 'onscrollend') : undefined;
    let notify: IntersectionObserverCallback = () => {};
    const observed: Element[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe(element: Element) { observed.push(element); }
      disconnect() {}
    });
    try {
      if (owner) Reflect.deleteProperty(owner, 'onscrollend');
      expect('onscrollend' in window).toBe(false);
      render(<Harness />);
      const { dialog } = await openAt('Sofa');
      expect(observed).toHaveLength(PHOTOS.length);

      const slide = dialog.querySelector('[data-index="3"]') as HTMLElement;
      act(() => notify([{ isIntersecting: true, target: slide } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(counter(dialog)).toHaveTextContent('4 / 5');
      expect(within(dialog).getByText('Bedroom 1')).toBeInTheDocument();
    } finally {
      if (owner && descriptor) Object.defineProperty(owner, 'onscrollend', descriptor);
    }
  });

  it('loads only the current photo and its neighbours eagerly', async () => {
    render(<Harness />);
    const { dialog } = await openAt('Oven');

    const loading = [...dialog.querySelectorAll('img')].map((img) => img.getAttribute('loading'));
    expect(loading).toEqual(['lazy', 'eager', 'eager', 'eager', 'lazy']);
    fireEvent.keyDown(dialog, { key: 'End' });
    expect([...dialog.querySelectorAll('img')].map((img) => img.getAttribute('loading')))
      .toEqual(['lazy', 'lazy', 'lazy', 'eager', 'eager']);
  });

  it('closes on Escape and returns focus to the photo that opened it', async () => {
    const onRequestClose = vi.fn();
    render(<Harness onRequestClose={onRequestClose} />);
    const { opener, dialog } = await openAt('Oven');
    // A real showModal moves focus into the dialog; the mock does not, so do it here.
    act(() => within(dialog).getByRole('button', { name: 'Close photo viewer' }).focus());
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onRequestClose).toHaveBeenCalledWith(3);
    expect(dialog).not.toHaveAttribute('open');
    expect(opener).toHaveFocus();
  });

  it('keeps focus in the dialog when previous/next disables itself at an end, so keys keep working', async () => {
    render(<Harness />);
    const { user, dialog } = await openAt('Table');
    const previous = within(dialog).getByRole('button', { name: 'Previous photo' });
    const next = within(dialog).getByRole('button', { name: 'Next photo' });

    await user.click(previous);
    expect(counter(dialog)).toHaveTextContent('1 / 5');
    expect(previous).toBeDisabled();
    expect(next).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(counter(dialog)).toHaveTextContent('2 / 5');

    await user.keyboard('{End}');
    expect(counter(dialog)).toHaveTextContent('5 / 5');
    expect(next).toBeDisabled();
    expect(previous).toHaveFocus();
    await user.keyboard('{Home}');
    expect(counter(dialog)).toHaveTextContent('1 / 5');
  });

  it('resets the caller and returns focus after a close it did not request', async () => {
    const onRequestClose = vi.fn();
    render(<Harness onRequestClose={onRequestClose} />);
    const { opener, dialog } = await openAt('Oven');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });

    // A native close without a cancel event (e.g. a forced close request).
    act(() => { (dialog as HTMLDialogElement).close(); });

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledWith(3);
    expect(opener).toHaveFocus();
    // The caller's openIndex went back to null, so the same photo opens again.
    await userEvent.setup().click(opener);
    expect(dialog).toHaveAttribute('open');
    expect(counter(dialog)).toHaveTextContent('3 / 5');
  });

  it('turns the native cancel (Escape) into the same close, and closes on its close button', async () => {
    const onRequestClose = vi.fn();
    render(<Harness onRequestClose={onRequestClose} />);
    const { user, opener, dialog } = await openAt('Bed');

    const cancel = new Event('cancel', { cancelable: true });
    act(() => { dialog.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented).toBe(true);
    expect(onRequestClose).toHaveBeenLastCalledWith(3);
    expect(opener).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'open Basin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Close photo viewer' }));
    expect(onRequestClose).toHaveBeenLastCalledWith(4);
    expect(dialog).not.toHaveAttribute('open');
  });
});
