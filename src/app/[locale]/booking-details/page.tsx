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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6 font-serif italic">
            {dictionary.bookingDetails || 'Booking Details'}
          </h1>

          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                How to Book
              </h2>
              <div className="space-y-3 text-slate-600 dark:text-slate-300">
                <p>• Contact us directly for availability and rates</p>
                <p>• Secure your dates with a deposit</p>
                <p>• Receive confirmation and payment details</p>
                <p>• Complete payment to finalize your booking</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                Pricing Information
              </h2>
              <div className="space-y-3 text-slate-600 dark:text-slate-300">
                <p>• Seasonal rates apply (high/low season)</p>
                <p>• Minimum stay requirements may apply</p>
                <p>• Additional fees: cleaning, local taxes</p>
                <p>• Payment plans available for longer stays</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                Cancellation Policy
              </h2>
              <div className="space-y-3 text-slate-600 dark:text-slate-300">
                <p>• Free cancellation up to 30 days before arrival</p>
                <p>• 50% refund for cancellations 14-30 days prior</p>
                <p>• No refund for cancellations within 14 days</p>
                <p>• Travel insurance recommended</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-4 font-serif italic">
                Contact Us
              </h2>
              <p className="text-blue-700 dark:text-blue-300 mb-4">
                Ready to book your stay? Get in touch with us for personalized assistance.
              </p>
              <div className="space-y-2 text-blue-600 dark:text-blue-400">
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