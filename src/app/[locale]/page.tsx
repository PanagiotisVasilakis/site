import Link from "next/link";
import { getCategoriesWithCounts, pickCategoryLocale, type CategoryWithCount } from "@/lib/data";
import { absUrl, siteUrl } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import HomeHero from "@/components/HomeHero";
import HomeInteractiveBar from "@/components/HomeInteractiveBar";
import ContactSection from "@/components/ContactSection";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cats: CategoryWithCount[] = getCategoriesWithCounts();
  return (
  <>
  <script
    type="application/ld+json"
    suppressHydrationWarning
    dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: t.appTitle,
      url: siteUrl,
      logo: absUrl('/favicon.ico')
    }) }}
  />
  <div className="cancel-top-gap">
    <HomeHero
      title={t.homeTitle}
      subtitle={t.homeSubtitle}
    />
  </div>
  <div className="page-container home-typography mx-auto max-w-4xl">
      <HomeInteractiveBar
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
  {/* Apartment Features */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <Link
          href={`/${eff}/apartment`}
          className="card p-6 flex flex-col items-center text-center transition-all group hover:shadow-lg"
        >
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>🏡</div>
          <div className="text-lg font-medium mb-2">{t.house?.navLabel || 'Apartment Photos'}</div>
        </Link>

        <Link
          href={`/${eff}/check-in`}
          className="card p-6 flex flex-col items-center text-center transition-all group hover:shadow-lg"
        >
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>✅</div>
          <div className="text-lg font-medium mb-2">Check-In Info</div>
        </Link>

        {cats.slice(0, 2).map((c) => (
          <Link
            key={c.id}
            href={`/${eff}/${c.slug}`}
            className="card p-6 flex flex-col items-center text-center transition-all group hover:shadow-lg"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>
              {c.icon ?? "📋"}
            </div>
            <div className="text-lg font-medium mb-2">
              {t.categories[c.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title)}
            </div>
          </Link>
        ))}
      </section>
  </div>
  <ContactSection locale={eff} />
  </>
  );
}
