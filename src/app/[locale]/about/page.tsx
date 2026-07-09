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
  const about = dictionary.about;

  const whyCards = [
    { icon: '🏖️', title: about?.whyLocationTitle, desc: about?.whyLocationDesc },
    { icon: '🏠', title: about?.whyAmenitiesTitle, desc: about?.whyAmenitiesDesc },
    { icon: '🤝', title: about?.whyServiceTitle, desc: about?.whyServiceDesc },
  ];

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
                {about?.introPre}<strong className="font-serif italic">Dolce Far Niente</strong>{about?.introPost}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="surface-subtle p-6">
                <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                  {about?.storyTitle}
                </h2>
                <p className="text-body leading-relaxed">
                  {about?.story}
                </p>
              </div>

              <div className="surface-subtle p-6">
                <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                  {about?.commitmentTitle}
                </h2>
                <p className="text-body leading-relaxed">
                  {about?.commitment}
                </p>
              </div>
            </div>

            <div className="surface-subtle p-6">
              <h2 className="text-xl section-title mb-4 font-serif italic font-bold">
                {about?.whyTitle}
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {whyCards.map((card) => (
                  <div key={card.title} className="text-center">
                    <div className="text-2xl mb-2">{card.icon}</div>
                    <h3 className="font-serif italic font-bold section-title mb-2">{card.title}</h3>
                    <p className="text-sm text-body">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-subtle brand-callout p-6 border border-soft">
              <h2 className="brand-callout-title text-xl section-title mb-4 font-serif italic font-bold">
                {about?.experienceTitle}
              </h2>
              <p className="text-body mb-4">
                {about?.experienceIntro}
              </p>
              <div className="space-y-2 text-body">
                {about?.experienceItems.map((item) => (
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

export async function generateMetadata({ params }: AboutPageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);
  return {
    title: `${dictionary.aboutUs || 'About Us'} | Dolce Far Niente`,
    description: dictionary.about?.metaDescription,
  };
}
