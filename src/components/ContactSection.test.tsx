import { render, screen } from '@testing-library/react';
import ContactSection from './ContactSection';

describe('ContactSection', () => {
  it('shows the Greek address label with the apartment address for Greek locale', () => {
    render(<ContactSection locale="el" />);

    expect(screen.getByRole('heading', { name: 'Διεύθυνση' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Αρχιμήδους 21\s+Καλαμάτα 24100, Ελλάδα/ })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/wW1Lnh14k3psKGAm9'
    );
  });
});
