// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ApartmentGalleryLightbox', () => ({
  default: ({ labels }: { labels: Record<string, string> }) => <div data-testid="lightbox-labels">{JSON.stringify(labels)}</div>,
}));

import ApartmentCinematic from '@/components/ApartmentCinematic';
import { getDictionary } from '@/i18n/dictionaries';
import type { ApartmentPhotoWithAlt } from '@/types/apartment';

const photos: ApartmentPhotoWithAlt[] = (['living', 'kitchen', 'bedroom', 'bedroom_2', 'balcony', 'bathroom'] as const)
  .map((altKey) => ({ src: `/images/${altKey}.jpg`, altKey }));

describe('apartment page copy', () => {
  it.each([
    ['en', {
      footer: '© Kalamata Apartment', secondBedroom: 'Second Bedroom', hero: 'Apartment hero',
      gallery: 'Open second bedroom gallery', specs: 'Specifications and actions', viewer: 'Photo viewer', thumbnail: 'View image {current} of {total}',
    }],
    ['el', {
      footer: '© Διαμέρισμα Καλαμάτας', secondBedroom: 'Δεύτερο Υπνοδωμάτιο', hero: 'Εικόνα διαμερίσματος',
      gallery: 'Άνοιγμα γκαλερί Δεύτερο Υπνοδωμάτιο', specs: 'Προδιαγραφές και ενέργειες', viewer: 'Προβολή φωτογραφιών', thumbnail: 'Προβολή εικόνας {current} από {total}',
    }],
  ] as const)('renders every label in %s, including the ones that used to be fallbacks', (locale, expected) => {
    const { container } = render(
      <ApartmentCinematic locale={locale} houseText={getDictionary(locale).house} photos={photos} />,
    );

    expect(screen.getByText(expected.footer)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: expected.secondBedroom })).toBeInTheDocument();
    expect(container.querySelector(`[aria-label="${expected.hero}"]`)).not.toBeNull();
    expect(container.querySelector(`[aria-label="${expected.gallery} 1"]`)).not.toBeNull();
    expect(container.querySelector(`[aria-label="${expected.specs}"]`)).not.toBeNull();
    const labels = JSON.parse(screen.getByTestId('lightbox-labels').textContent ?? '{}');
    expect(labels).toMatchObject({ title: expected.viewer, thumbnail: expected.thumbnail });
  });
});
