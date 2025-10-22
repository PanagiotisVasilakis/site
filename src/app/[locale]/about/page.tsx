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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6 font-serif italic">
            {dictionary.aboutUs || 'About Us'}
          </h1>

          <div className="space-y-8">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                Welcome to <strong className="font-serif italic">Dolce Far Niente</strong> - where luxury meets the art of doing nothing.
                Our carefully curated apartment offers the perfect blend of modern comfort and traditional Greek hospitality.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                  Our Story
                </h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Nestled in the heart of Kalamata, our apartment represents the essence of Mediterranean living.
                  Every detail has been thoughtfully designed to provide an unforgettable experience for our guests.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                  Our Commitment
                </h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  We are dedicated to providing exceptional hospitality with attention to every detail.
                  From the moment you arrive until your departure, we ensure your stay is comfortable and memorable.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4 font-serif italic">
                Why Choose Us
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl mb-2">🏖️</div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-2">Prime Location</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Steps from the beach and town center</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🏠</div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-2">Luxury Amenities</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Modern comforts with Greek charm</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🤝</div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-200 mb-2">Personal Service</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Dedicated support throughout your stay</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-4 font-serif italic">
                Experience Kalamata
              </h2>
              <p className="text-blue-700 dark:text-blue-300 mb-4">
                Our apartment serves as your gateway to discovering the authentic beauty of Kalamata and the Peloponnese region.
              </p>
              <div className="space-y-2 text-blue-600 dark:text-blue-400">
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