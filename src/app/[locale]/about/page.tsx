import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

interface AboutPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);

  return (
    <div className="page-bg min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="surface-card rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl page-title mb-6 font-serif italic font-bold">
            {dictionary.aboutUs || 'About Us'}
          </h1>

          <div className="space-y-8">
            <div className="max-w-none">
              <p className="text-lg text-body leading-relaxed">
                Welcome to <strong className="font-serif italic">Dolce Far Niente</strong> - where luxury meets the art of doing nothing.
                Our carefully curated apartment offers the perfect blend of modern comfort and traditional Greek hospitality.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="surface-subtle p-6">
                <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                  Our Story
                </h2>
                <p className="text-body leading-relaxed">
                  Nestled in the heart of Kalamata, our apartment represents the essence of Mediterranean living.
                  Every detail has been thoughtfully designed to provide an unforgettable experience for our guests.
                </p>
              </div>

              <div className="surface-subtle p-6">
                <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                  Our Commitment
                </h2>
                <p className="text-body leading-relaxed">
                  We are dedicated to providing exceptional hospitality with attention to every detail.
                  From the moment you arrive until your departure, we ensure your stay is comfortable and memorable.
                </p>
              </div>
            </div>

            <div className="surface-subtle p-6">
              <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                Why Choose Us
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl mb-2">🏖️</div>
                  <h3 className="font-serif italic font-bold section-title mb-2">Prime Location</h3>
                  <p className="text-sm text-body">Steps from the beach and town center</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🏠</div>
                  <h3 className="font-serif italic font-bold section-title mb-2">Luxury Amenities</h3>
                  <p className="text-sm text-body">Modern comforts with Greek charm</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🤝</div>
                  <h3 className="font-serif italic font-bold section-title mb-2">Personal Service</h3>
                  <p className="text-sm text-body">Dedicated support throughout your stay</p>
                </div>
              </div>
            </div>

            <div className="surface-subtle brand-callout p-6 border border-soft">
              <h2 className="brand-callout-title text-xl section-title mb-4 font-serif italic font-bold">
                Experience Kalamata
              </h2>
              <p className="text-body mb-4">
                Our apartment serves as your gateway to discovering the authentic beauty of Kalamata and the Peloponnese region.
              </p>
              <div className="space-y-2 text-body">
                <p>🏛️ Historic sites and museums</p>
                <p>🍽️ Local cuisine and tavernas</p>
                <p>🏖️ Beautiful beaches and coastline</p>
                <p>🍇 Wine tasting in nearby vineyards</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: AboutPageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);
  return {
    title: `${dictionary.aboutUs || 'About Us'} | Dolce Far Niente`,
    description: 'Learn about our story, commitment to luxury hospitality, and why guests choose our apartment in Kalamata, Greece.',
  };
}
