import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingPage from '@/app/[locale]/book/page';
import BookingForm from '@/components/BookingForm';

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
  trackEvent: () => {}
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

  it('shows pricing breakdown when valid dates provided', async () => {
    const ui = await BookingPage({ params: makeParams('en'), searchParams: makeSearchParams({ guests: '2', checkin: '2025-09-10', checkout: '2025-09-15' }) });
    render(ui);
    expect(screen.getByText(/Price Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
    const pricingSection = screen.getByText(/Price Breakdown/i).closest('div');
    expect(pricingSection).toMatchInlineSnapshot(`
      <div
        class="space-y-3"
      >
        <h4
          class="font-semibold text-[color:var(--fg-default)]"
        >
          Price breakdown
        </h4>
        <div
          class="space-y-2 text-sm"
        >
          <div
            class="flex justify-between text-[color:var(--fg-muted)]"
          >
            <span>
              €
              65
               × 
              5
               
              guests
            </span>
            <span>
              €
              325
            </span>
          </div>
          <div
            class="flex justify-between text-[color:var(--fg-muted)]"
          >
            <span>
              Cleaning fee
            </span>
            <span>
              €
              25
            </span>
          </div>
          <div
            class="flex justify-between text-[color:var(--fg-muted)]"
          >
            <span>
              Service fee
            </span>
            <span>
              €
              15
            </span>
          </div>
        </div>
        <div
          class="border-t border-[color:var(--border-soft)] pt-3"
        >
          <div
            class="flex justify-between font-semibold text-lg text-[color:var(--fg-default)]"
          >
            <span>
              Total
            </span>
            <span>
              €
              365
            </span>
          </div>
        </div>
      </div>
    `);
  });

  it('shows initial validation errors and enables submit once fields valid', async () => {
    // Use a future date range to avoid date-in-the-past guard affecting UI
    const ui = await BookingPage({ params: makeParams('en'), searchParams: makeSearchParams({ guests: '2', checkin: '2025-12-05', checkout: '2025-12-07' }) });
    render(ui);
    // Initial validation errors visible
    expect(screen.getByText(/Please fix the following/i)).toBeInTheDocument();
    expect(screen.getByText(/First name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Last name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Phone number is required/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Confirm booking/i });
    expect(submitBtn).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First name/i), 'Jane');
    await user.type(screen.getByLabelText(/Last name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email address/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '+30 2100000000');

    await waitFor(() => {
      expect(screen.queryByText(/Please fix the following/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Confirm booking/i })).toBeEnabled();
  });

  it('BookingForm component validates and submits (happy path)', async () => {
  // Ensure previous DOM nodes removed (defensive in case global cleanup missed)
  cleanup();
    const dateRange: { from: Date; to: Date } = { from: new Date('2025-09-10'), to: new Date('2025-09-12') };
    render(
      <BookingForm
        dateRange={dateRange}
        guests={2}
        total={200}
        locale="en"
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
