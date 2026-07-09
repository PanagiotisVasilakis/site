import React from 'react';
import { render, screen } from '@testing-library/react';
import StaticLocationMap from '@/components/StaticLocationMap';

// Basic smoke + locale snapshot-ish checks (lightweight)

describe('StaticLocationMap', () => {
  it('renders English content', () => {
    render(<StaticLocationMap locale="en" compact />);
    expect(screen.getByTestId('static-map-title')).toHaveTextContent(/Explore the Neighborhood/i);
    expect(screen.getByText(/Kalamata/)).toBeInTheDocument();
  });

  it('renders Greek content', () => {
    render(<StaticLocationMap locale="el" compact />);
    const title = screen.getByTestId('static-map-title');
    // Updated to match new i18n dictionary value
    expect(title).toHaveTextContent(/Τοποθεσία & Κοντινά/i);
    expect(screen.getByText(/Καλαμάτα/)).toBeInTheDocument();
  });

  it('uses the shared landmark catalog for the complete fallback panel', () => {
    const { rerender } = render(<StaticLocationMap locale="en" />);
    expect(screen.getByText('Almyros Beach')).toBeInTheDocument();
    expect(screen.getByText('Sklavenitis Supermarket')).toBeInTheDocument();

    rerender(<StaticLocationMap locale="el" />);
    expect(screen.getByText('Παραλία Αλμυρού')).toBeInTheDocument();
    expect(screen.getByText('Ιερός Ναός Αγίας Τριάδας')).toBeInTheDocument();
  });
});
