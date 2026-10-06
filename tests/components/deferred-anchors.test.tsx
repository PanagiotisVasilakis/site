// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ErrorSummary from '@/components/ErrorSummary';

// The #contact anchor is the home ContactBand (tests/components/home-sections-v5c.test.tsx).
describe('error summary support link', () => {
  it('points to the contact section of the current locale by default', () => {
    render(<ErrorSummary summary="Failed" locale="el" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/el#contact');
  });
});
