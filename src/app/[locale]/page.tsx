import { getCategoriesWithCounts, pickCategoryLocale, type CategoryWithCount } from "@/lib/data";
import { absUrl, siteUrl } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import HomeHero from "@/components/HomeHero";
import DeferredHomeInteractiveBar from "@/components/DeferredHomeInteractiveBar";
import DeferredContactSection from "@/components/DeferredContactSection";
import HomeFeatureGrid, { type HomeFeature } from "@/components/home/HomeFeatureGrid";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cats: CategoryWithCount[] = getCategoriesWithCounts();
  const featureCards: HomeFeature[] = [
    {
      href: `/${eff}/apartment`,
      label: t.house?.navLabel || 'Apartment Photos',
      icon: '🏡',
    },
    {
      href: `/${eff}/check-in`,
      label: t.checkin?.navInfoLabel || 'Check-In Info',
      icon: '✅',
    },
    ...cats.slice(0, 2).map((c) => ({
      href: `/${eff}/${c.slug}`,
      label: t.categories[c.slug as "phones" | "moments"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title),
      icon: c.icon ?? "📋",
    })),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: t.appTitle,
            url: siteUrl,
            logo: absUrl('/favicon.ico')
          })
        }}
      />
      <div className="cancel-top-gap">
        <HomeHero
          title={t.homeTitle}
          subtitle={t.homeSubtitle}
        />
      </div>
      <div className="page-container home-typography mx-auto max-w-5xl">
        <DeferredHomeInteractiveBar
          locale={eff}
          subline={eff === 'el' ? 'Πολυτελές διαμέρισμα στην Καλαμάτα' : 'Luxury apartment in Kalamata, Greece'}
          labels={{
            dates: t.search?.dates || 'Dates',
            addDates: t.search?.addDates || 'Add dates',
            guestsLabel: t.search?.guestsLabel || 'Guests',
            guestSingular: t.search?.guestSingular || 'guest',
            guestPlural: t.search?.guestPlural || 'guests',
            checkAvailability: 'Check availability',
            arrivalLabel: t.search?.arrivalLabel,
            arrivalPlaceholder: t.search?.arrivalPlaceholder,
            departureLabel: t.search?.departureLabel,
            departurePlaceholder: t.search?.departurePlaceholder
          }}
        />
        <HomeFeatureGrid
          label={eff === 'el' ? 'Βασικές επιλογές οδηγού επισκέπτη' : 'Guest guide shortcuts'}
          features={featureCards}
        />
      </div>
      <DeferredContactSection locale={eff} />
    </>
  );
}
