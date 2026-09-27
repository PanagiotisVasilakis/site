// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/internalFetchClient', () => ({ default: vi.fn() }));

import BookingForm from '@/components/BookingForm';
import internalFetch from '@/lib/internalFetchClient';
import { getDictionary } from '@/i18n/dictionaries';

async function submitWith(locale: 'en' | 'el', status: number) {
  const labels = getDictionary(locale).booking!.form!;
  vi.mocked(internalFetch).mockResolvedValue(new Response(
    JSON.stringify({ success: false, error: { message: 'Too many booking requests. Please try again later.' } }),
    { status, headers: { 'content-type': 'application/json' } },
  ));
  const user = userEvent.setup();
  render(<BookingForm checkIn="2030-11-01" checkOut="2030-11-05" locale={locale} labels={labels} propertyName="Test Apartment" />);
  await user.type(screen.getByLabelText(labels.firstName), 'Ada');
  await user.type(screen.getByLabelText(labels.lastName), 'Lovelace');
  await user.type(screen.getByLabelText(labels.email), 'ada@example.test');
  await user.type(screen.getByLabelText(labels.phone), '+30 694 111 2222');
  await user.click(screen.getByRole('button', { name: labels.confirm }));
  return labels;
}

describe('booking form server errors', () => {
  it.each([
    [429, 'submitRateLimited'],
    [422, 'submitRejected'],
    [503, 'submitFailed'],
  ] as const)('shows the Greek text for a %s response instead of the English server message', async (status, key) => {
    const labels = await submitWith('el', status);

    expect(await screen.findByRole('alert')).toHaveTextContent(labels[key]);
    expect(screen.queryByText(/Too many booking requests/u)).not.toBeInTheDocument();
    // The alert announces the message itself; the polite region does not repeat another text.
    expect(screen.getAllByText(labels[key])).toHaveLength(1);
  });

  it('uses the English dictionary on /en', async () => {
    const labels = await submitWith('en', 429);

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.submitRateLimited);
  });
});
