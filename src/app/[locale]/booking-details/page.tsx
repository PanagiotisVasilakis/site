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
  const dp = dictionary.booking?.detailsPage;

  const sections = [
    { title: dp?.howToBookTitle, items: dp?.howToBook },
    { title: dp?.pricingTitle, items: dp?.pricing },
    { title: dp?.cancellationTitle, items: dp?.cancellation },
  ];

  return (
    <div className="page-bg min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="surface-card rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl page-title mb-6 font-serif italic font-bold">
            {dictionary.bookingDetails || 'Booking Details'}
          </h1>

          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.title} className="surface-subtle p-6">
                <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                  {section.title}
                </h2>
                <div className="space-y-3 text-body">
                  {section.items?.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              </div>
            ))}

            <div className="surface-subtle brand-callout p-6 border border-soft">
              <h2 className="brand-callout-title text-xl section-title mb-4 font-serif italic font-bold">
                {dp?.contactTitle}
              </h2>
              <p className="text-body mb-4">
                {dp?.contactIntro}
              </p>
              <div className="space-y-2 text-body">
                {dp?.contact.map((item) => (
                  <p key={item}>{item}</p>
                ))}
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
    description: dictionary.booking?.detailsPage?.metaDescription,
  };
}
