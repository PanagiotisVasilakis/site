import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StaticLocationMap from '@/components/StaticLocationMap';

// Basic smoke + locale snapshot-ish checks (lightweight)

describe('StaticLocationMap', () => {
  it('renders English content', () => {
    const { container } = render(<StaticLocationMap locale="en" compact />);
    expect(screen.getByTestId('static-map-title')).toHaveTextContent(/Location|Attractions/i);
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
                class="text-lg sm:text-xl font-semibold text-brand-800"
                data-testid="static-map-title"
              >
                Villa Location & Nearby Attractions
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
                  Quiet neighborhood, 50m from Town Hall with mountain & sea views
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
    const allTitles = screen.getAllByTestId('static-map-title');
    expect(allTitles[0]).toHaveTextContent(/Villa Location|Attractions/i);
    expect(allTitles[1]).toHaveTextContent(/Τοποθεσία|Αξιοθέατα/i);
    expect(screen.getByText(/Καλαμάτα/)).toBeInTheDocument();
    // Snapshot only the Greek instance
    expect(allTitles[1].parentElement?.parentElement?.parentElement?.parentElement).toMatchInlineSnapshot(`
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
                class="text-lg sm:text-xl font-semibold text-brand-800"
                data-testid="static-map-title"
              >
                Τοποθεσία & Κοντινά Αξιοθέατα
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
                  Ήσυχη γειτονιά, 50μ από το Δημαρχείο με θέα βουνό & θάλασσα
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    `);
  });
});
