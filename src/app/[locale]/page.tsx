import Link from "next/link";
import { getCategoriesWithCounts, pickCategoryLocale } from "@/lib/data";
import { absUrl, siteUrl } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import HomeHero from "@/components/HomeHero";
import HomeInteractiveBar from "@/components/HomeInteractiveBar";

interface CategoryWithCount { id: string; slug: string; title: string; description?: string; count: number; icon?: string; }

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cats: CategoryWithCount[] = getCategoriesWithCounts() as CategoryWithCount[];
  return (
  <div className="mx-auto max-w-4xl p-6">
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
      <HomeHero
        title={t.homeTitle}
        subtitle={t.homeSubtitle}
        locale={eff}
      />
      <HomeInteractiveBar
        locale={eff}
        labels={{
          dates: t.search?.dates || 'Dates',
          addDates: t.search?.addDates || 'Add dates',
          guestsLabel: t.search?.guestsLabel || 'Guests',
          guestSingular: t.search?.guestSingular || 'guest',
          guestPlural: t.search?.guestPlural || 'guests',
          checkAvailability: 'Check availability'
        }}
      />
      {/* Villa Features */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <Link
          href={`/${eff}/house`}
          className="card p-6 flex flex-col items-center text-center transition-colors hover:bg-white/90 group"
        >
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>🏡</div>
          <div className="text-lg font-medium mb-2" style={{color:'var(--text-accent)'}}>{t.house?.navLabel || 'Villa Photos'}</div>
          <div className="text-sm text-gray-600">{t.house?.navSubtitle || 'Cinematic tour & amenities'}</div>
        </Link>

        {cats.slice(0, 2).map((c) => (
          <Link
            key={c.id}
            href={`/${eff}/${c.slug}`}
            className="card p-6 flex flex-col items-center text-center transition-colors hover:bg-white/90 group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>
              {c.icon ?? "📋"}
            </div>
            <div className="text-lg font-medium mb-2" style={{color:'var(--text-accent)'}}>
              {t.categories[c.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title)}
            </div>
            <div className="text-sm text-gray-600">
              {c.count} local {c.count === 1 ? t.itemSingular : t.itemPlural}
            </div>
          </Link>
        ))}
      </section>
  </div>
  );
}
