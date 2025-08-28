import Link from "next/link";
import { getCategoriesWithCounts, pickCategoryLocale, getItemsByCategory, pickLocale as pickItemLocale, toSlug } from "@/lib/data";
import { absUrl, siteUrl } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import HomeHero from "@/components/HomeHero";
import { Suspense } from 'react';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';
import HomeInteractiveBar from "@/components/HomeInteractiveBar";
import ListingCard from "@/components/ListingCard";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cats = getCategoriesWithCounts();
  // Collect featured items (simple slice for now)
  const featured = cats.flatMap(c => getItemsByCategory(c.id).filter(i => i.featured).map(i => ({
    id: i.id,
    title: pickItemLocale(i as unknown as Record<string, unknown>, 'name', eff) || i.name,
    subtitle: pickItemLocale(i as unknown as Record<string, unknown>, 'summary', eff) || i.summary,
    rating: i.rating,
    price: i.priceLevel ? '€'.repeat(i.priceLevel) : undefined,
    icon: c.icon,
    href: `/${eff}/${c.slug}/${i.slug || toSlug(i.name)}`,
    favoriteId: `${c.id}:${i.id}`
  }))).slice(0, 6);
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
        labels={t.search}
        categories={cats.map(c => ({ id: c.id, slug: c.slug, title: pickCategoryLocale(c, 'title', eff) || c.title, icon: c.icon }))}
      />
      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold tracking-wide uppercase mb-3 text-brand-800" data-dark-color="var(--brand-100)">Featured</h2>
          <Suspense fallback={<div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">{Array.from({length:6}).map((_,i)=><ListingCardSkeleton key={i}/> )}</div>}>
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
              {featured.map(f => (
                <ListingCard key={f.id} id={f.id} title={f.title} subtitle={f.subtitle} rating={f.rating} price={f.price} icon={f.icon} href={f.href} favoriteId={f.favoriteId} />
              ))}
            </div>
          </Suspense>
        </section>
      )}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cats.map((c) => (
          <Link
            key={c.id}
            href={`/${eff}/${c.slug}`}
            className="card p-4 flex items-center justify-between transition-colors hover:bg-white/90"
          >
            <div>
              <div className="text-lg font-medium text-brand-800">{t.categories[c.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title)}</div>
              {(pickCategoryLocale(c, "description", eff) ?? c.description) && (
                <div className="text-xs text-gray-600">{pickCategoryLocale(c, "description", eff) ?? c.description}</div>
              )}
              <div className="text-xs mt-1 text-gray-500">{c.count} {c.count === 1 ? t.itemSingular : t.itemPlural}</div>
            </div>
            <div className="text-2xl" aria-hidden>
              {c.icon ?? "➡️"}
            </div>
          </Link>
        ))}
      </section>
  </div>
  );
}
