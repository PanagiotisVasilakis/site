// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analyticsClient', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/internalFetchClient', () => ({ default: vi.fn() }));

import BookingForm from '@/components/BookingForm';
import { getDictionary } from '@/i18n/dictionaries';

const labels = getDictionary('en').booking!.form!;

describe('booking form validation', () => {
  it('shows field errors and re-enables submit after an invalid submission', async () => {
    const user = userEvent.setup();
    render(
      <BookingForm
        dateRange={{ from: new Date('2030-07-10T00:00:00Z'), to: new Date('2030-07-12T00:00:00Z') }}
        locale="en"
        labels={labels}
        propertyName="Test Apartment"
      />,
    );

    await user.click(screen.getByRole('button', { name: labels.confirm }));

    await waitFor(() => {
      expect(document.getElementById('firstName-error')).toHaveTextContent(labels.firstNameRequired);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: labels.confirm })).toBeEnabled();
    });
  });
});
