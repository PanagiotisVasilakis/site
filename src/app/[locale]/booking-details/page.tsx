import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

interface BookingDetailsPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function BookingDetailsPage({ params }: BookingDetailsPageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);

  return (
    <div className="page-bg min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="surface-card rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl page-title mb-6 font-serif italic font-bold">
            {dictionary.bookingDetails || 'Booking Details'}
          </h1>

          <div className="space-y-6">
            <div className="surface-subtle p-6">
              <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                How to Book
              </h2>
              <div className="space-y-3 text-body">
                <p>• Contact us directly for availability and rates</p>
                <p>• Secure your dates with a deposit</p>
                <p>• Receive confirmation and payment details</p>
                <p>• Complete payment to finalize your booking</p>
              </div>
            </div>

            <div className="surface-subtle p-6">
              <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                Pricing Information
              </h2>
              <div className="space-y-3 text-body">
                <p>• Seasonal rates apply (high/low season)</p>
                <p>• Minimum stay requirements may apply</p>
                <p>• Additional fees: cleaning, local taxes</p>
                <p>• Payment plans available for longer stays</p>
              </div>
            </div>

            <div className="surface-subtle p-6">
              <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                Cancellation Policy
              </h2>
              <div className="space-y-3 text-body">
                <p>• Free cancellation up to 30 days before arrival</p>
                <p>• 50% refund for cancellations 14-30 days prior</p>
                <p>• No refund for cancellations within 14 days</p>
                <p>• Travel insurance recommended</p>
              </div>
            </div>

            <div className="surface-subtle brand-callout p-6 border border-soft">
              <h2 className="brand-callout-title text-xl section-title mb-4 font-serif italic font-bold">
                Contact Us
              </h2>
              <p className="text-body mb-4">
                Ready to book your stay? Get in touch with us for personalized assistance.
              </p>
              <div className="space-y-2 text-body">
                <p>📧 Email: info@dolcefariente.com</p>
                <p>📱 Phone: +30 2721 023456</p>
                <p>💬 WhatsApp: Available for instant booking</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: BookingDetailsPageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);
  return {
    title: `${dictionary.bookingDetails || 'Booking Details'} | Dolce Far Niente`,
    description: 'Learn about our booking process, pricing, and policies for your stay at our luxury apartment.',
  };
}
