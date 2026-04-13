import React from 'react';
import { render, screen } from '@testing-library/react';
import StaticLocationMap from '@/components/StaticLocationMap';

// Basic smoke + locale snapshot-ish checks (lightweight)

describe('StaticLocationMap', () => {
  it('renders English content', () => {
    const { container } = render(<StaticLocationMap locale="en" compact />);
    expect(screen.getByTestId('static-map-title')).toHaveTextContent(/Explore the Neighborhood/i);
    expect(screen.getByText(/Kalamata/)).toBeInTheDocument();
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class=" relative"
        style="height: 400px;"
      >
        <div
          class="w-full h-full bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg flex items-center justify-center border border-brand-200"
        >
          <div
            class="text-center p-6 sm:p-8 max-w-md w-full"
          >
            <div
              class="flex flex-col items-center mb-4"
            >
              <div
                aria-hidden="true"
                class="text-5xl mb-2"
              >
                🏖️
              </div>
              <h3
                class="text-lg sm:text-xl font-serif italic font-bold text-brand-800"
                data-testid="static-map-title"
              >
                Explore the Neighborhood
              </h3>
            </div>
            <div
              class="space-y-3 text-sm"
            >
              <section
                class="bg-white/70 rounded-lg p-4"
              >
                <header
                  class="flex items-center gap-2 mb-2"
                >
                  <span
                    aria-hidden="true"
                  >
                    🏡
                  </span>
                  <strong>
                    2-Bedroom Apartment with Views
                  </strong>
                </header>
                <p
                  class="text-gray-700 text-sm leading-snug"
                >
                  Kalamata, Greece
                </p>
                <p
                  class="text-gray-600 whitespace-pre-wrap break-words leading-snug mt-1"
                >
                  A quiet neighborhood just 50m from the Town Hall, with stunning mountain and sea views.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    `);
  });

  it('renders Greek content', () => {
    render(<StaticLocationMap locale="el" compact />);
    const title = screen.getByTestId('static-map-title');
    // Updated to match new i18n dictionary value
    expect(title).toHaveTextContent(/Τοποθεσία & Κοντινά/i);
    expect(screen.getByText(/Καλαμάτα/)).toBeInTheDocument();
    // Snapshot the Greek instance
    expect(title.parentElement?.parentElement?.parentElement?.parentElement).toMatchInlineSnapshot(`
      <div
        class=" relative"
        style="height: 400px;"
      >
        <div
          class="w-full h-full bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg flex items-center justify-center border border-brand-200"
        >
          <div
            class="text-center p-6 sm:p-8 max-w-md w-full"
          >
            <div
              class="flex flex-col items-center mb-4"
            >
              <div
                aria-hidden="true"
                class="text-5xl mb-2"
              >
                🏖️
              </div>
              <h3
                class="text-lg sm:text-xl font-serif italic font-bold text-brand-800"
                data-testid="static-map-title"
              >
                Τοποθεσία & Κοντινά
              </h3>
            </div>
            <div
              class="space-y-3 text-sm"
            >
              <section
                class="bg-white/70 rounded-lg p-4"
              >
                <header
                  class="flex items-center gap-2 mb-2"
                >
                  <span
                    aria-hidden="true"
                  >
                    🏡
                  </span>
                  <strong>
                    Διαμέρισμα 2 Υπνοδωματίων με Θέα
                  </strong>
                </header>
                <p
                  class="text-gray-700 text-sm leading-snug"
                >
                  Καλαμάτα, Ελλάδα
                </p>
                <p
                  class="text-gray-600 whitespace-pre-wrap break-words leading-snug mt-1"
                >
                  Μια ήσυχη γειτονιά μόλις 50μ από το Δημαρχείο, με εκπληκτική θέα σε βουνό και θάλασσα.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    `);
  });
});
