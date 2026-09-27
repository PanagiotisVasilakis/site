// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ContactSection', () => ({
  default: () => <section id="contact" data-testid="contact-section">Contact</section>,
}));
vi.mock('@/components/HomeInteractiveBar', () => ({
  default: () => <div id="home-booking-bar" data-testid="booking-bar">Booking</div>,
}));

import DeferredContactSection from '@/components/DeferredContactSection';
import DeferredHomeInteractiveBar from '@/components/DeferredHomeInteractiveBar';
import ErrorSummary from '@/components/ErrorSummary';

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('anchors to lazily mounted sections', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.location.hash = '';
  });

  it('keeps the #contact anchor on the placeholder before the section loads', () => {
    const { container } = render(<DeferredContactSection locale="en" />);

    expect(container.querySelector('#contact')).not.toBeNull();
    expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
  });

  it('loads the contact section at once for a #contact link and scrolls to it', async () => {
    window.location.hash = '#contact';
    render(<DeferredContactSection locale="en" />);

    await flush();

    expect(screen.getByTestId('contact-section')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('loads the contact section when the hash changes to #contact', async () => {
    render(<DeferredContactSection locale="en" />);
    await flush();
    expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();

    window.location.hash = '#contact';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();

    expect(screen.getByTestId('contact-section')).toBeInTheDocument();
  });

  it('loads the booking bar at once for a #book-now link instead of after page load + 1.8 s', async () => {
    window.location.hash = '#book-now';
    render(<DeferredHomeInteractiveBar locale="en" />);

    await flush();

    expect(screen.getByTestId('booking-bar')).toBeInTheDocument();
  });

  it('still defers the booking bar without the hash', async () => {
    render(<DeferredHomeInteractiveBar locale="en" />);

    await flush();

    expect(screen.queryByTestId('booking-bar')).not.toBeInTheDocument();
  });
});

describe('error summary support link', () => {
  it('points to the contact section of the current locale by default', () => {
    render(<ErrorSummary summary="Failed" locale="el" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/el#contact');
  });
});
