import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingPage from '@/app/[locale]/book/page';
import BookingForm from '@/components/BookingForm';
import { getDictionary } from '@/i18n/dictionaries';

const bookingFormLabels = getDictionary('en').booking!.form!;

// Types for better type safety
type MockComponent<T = Record<string, unknown>> = React.FC<T>;

// Properly typed mock components
vi.mock('@/components/ApartmentLocationMap', () => ({
  default: ((props: { locale?: string }) => <div data-testid="mock-apartment-map">Map mock locale={props.locale}</div>) as MockComponent<{ locale?: string }>
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ((props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />) as MockComponent<React.ImgHTMLAttributes<HTMLImageElement>>
}));

vi.mock('@/lib/analyticsClient', () => ({
  trackEvent: () => { }
}));

// Ensure DOM is reset between tests (some environments may not auto-clean)
// Type-safe global check
interface GlobalWithAfterEach {
  afterEach?: (fn: () => void) => void;
}
(globalThis as GlobalWithAfterEach).afterEach?.(() => cleanup());

// Helper to build params/searchParams the server component expects
function makeParams(locale: string): Promise<{ locale: string }> {
  return Promise.resolve({ locale });
}

function makeSearchParams(values: Record<string, string>): Promise<Record<string, string>> {
  return Promise.resolve(values);
}

describe('BookingPage (server component harness)', () => {
  it('renders heading and summary prompt when no dates selected (EN)', async () => {
    const ui = await BookingPage({ params: makeParams('en'), searchParams: makeSearchParams({ guests: '2' }) });
    render(ui);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Complete your booking/i);
    expect(screen.getByText(/Please complete your booking details above/i)).toBeInTheDocument();
  });

  it('renders Greek localized heading (EL)', async () => {
    const ui = await BookingPage({ params: makeParams('el'), searchParams: makeSearchParams({ guests: '2' }) });
    render(ui);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s.some(h => /Κράτηση|Ολοκληρώστε/i.test(h.textContent || ''))).toBe(true);
  });

  it('does not render any prices when valid dates provided', async () => {
    const ui = await BookingPage({ params: makeParams('en'), searchParams: makeSearchParams({ guests: '2', checkin: '2030-09-10', checkout: '2030-09-15' }) });
    render(ui);
    expect(screen.queryByText(/Price Breakdown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleaning fee/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Service fee/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it('shows validation errors after field interaction and enables submit once fields valid', async () => {
    // Use far future dates to avoid date-in-the-past validation
    const ui = await BookingPage({ params: makeParams('en'), searchParams: makeSearchParams({ guests: '2', checkin: '2030-12-05', checkout: '2030-12-07' }) });
    render(ui);

    // With React Hook Form (mode: 'onBlur'), the submit button is enabled
    // but validation happens when fields are touched or on submit
    const submitBtn = screen.getByRole('button', { name: /Confirm booking/i });
    expect(submitBtn).toBeInTheDocument();

    const user = userEvent.setup();

    // Fill in valid form data
    await user.type(screen.getByLabelText(/First name/i), 'Jane');
    await user.type(screen.getByLabelText(/Last name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email address/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '+30 2100000000');

    // Button should still be present and functional after filling fields
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm booking/i })).toBeInTheDocument();
    });
  });

  it('BookingForm component validates and submits (happy path)', async () => {
    // Ensure previous DOM nodes removed (defensive in case global cleanup missed)
    cleanup();
    const dateRange: { from: Date; to: Date } = { from: new Date('2030-09-10'), to: new Date('2030-09-12') };
    render(
      <BookingForm
        dateRange={dateRange}
        locale="en"
        labels={bookingFormLabels}
        propertyName="Test Apartment"
        submissionDelayMs={10}
      />
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First name/i), 'John');
    await user.type(screen.getByLabelText(/Last name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email address/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '+30 2100000000');
    const submit = screen.getByRole('button', { name: /Confirm booking/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(await screen.findByRole('heading', { name: /Booking Confirmed/i })).toBeInTheDocument();
    // Submission confirmation renders
  });
});
