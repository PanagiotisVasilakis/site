// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/internalFetchClient', () => ({ default: vi.fn() }));

import BookingForm from '@/components/BookingForm';
import internalFetch from '@/lib/internalFetchClient';
import { getDictionary } from '@/i18n/dictionaries';

const labels = getDictionary('en').booking!.form!;

describe('booking form validation', () => {
  it('shows field errors and re-enables submit after an invalid submission', async () => {
    const user = userEvent.setup();
    render(
      <BookingForm
        checkIn="2030-07-10"
        checkOut="2030-07-12"
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

  it('submits the selected calendar dates and confirms them unchanged in a time zone west of UTC', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    vi.mocked(internalFetch).mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { id: 'stay-1', status: 'queued' } }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    ));
    const user = userEvent.setup();
    render(
      <BookingForm checkIn="2030-11-01" checkOut="2030-11-05" locale="en" labels={labels} propertyName="Test Apartment" />,
    );

    await user.type(screen.getByLabelText(labels.firstName), 'Ada');
    await user.type(screen.getByLabelText(labels.lastName), 'Lovelace');
    await user.type(screen.getByLabelText(labels.email), 'ada@example.test');
    await user.type(screen.getByLabelText(labels.phone), '+30 694 111 2222');
    await user.click(screen.getByRole('button', { name: labels.confirm }));

    await waitFor(() => expect(internalFetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(vi.mocked(internalFetch).mock.calls[0][1]?.body));
    expect(body.dateRange).toEqual({ from: '2030-11-01', to: '2030-11-05' });
    expect(await screen.findByText(/Nov 1\s*–\s*5, 2030/)).toBeInTheDocument();
  });
});
