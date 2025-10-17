import Link from "next/link";
import { Suspense } from "react";
import { categories } from "@/data/categories";
import { getItem, mapsHref, telHref, getItemsByCategory, toSlug, pickLocale, isRecentlyUpdated } from "@/lib/data";
import { absUrl, normalizeExternalUrl } from "@/lib/site";
import { ResponsiveImage } from "@/components/ResponsiveImage";
import { CTAButton } from "@/components/CTAButton";
import MapEmbed from "@/components/MapEmbed";
import { Skeleton } from "@/components/Skeleton";
import FavoriteButton from "@/components/FavoriteButton";
import ShareButton from "@/components/ShareButton";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";

export const dynamic = 'force-dynamic';
export default async function ItemPage({ params }: { params: Promise<{ locale: string; category: string; slug: string }> }) {
  const { locale, category, slug } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff ?? "en");
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return notFound();
  const item = getItem(cat.id, slug);
  if (!item) return notFound();

  const tel = telHref(item.phone);
  const maps = mapsHref(item.address, item.location?.lat, item.location?.lng);

  const name = pickLocale(item, "name", eff) ?? item.name;
  const summary = pickLocale(item, "summary", eff) ?? item.summary;
  const address = pickLocale(item, "address", eff) ?? item.address;

  const recently = isRecentlyUpdated(item);
  const website = normalizeExternalUrl(item.website);
  const reservationUrl = normalizeExternalUrl(item.reservationUrl);
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4 safe-bottom">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Place',
          name,
          description: summary,
          address,
          url: absUrl(`/${eff}/${cat.slug}/${slug}`),
          telephone: item.phone,
          aggregateRating: item.rating ? { '@type': 'AggregateRating', ratingValue: item.rating } : undefined,
          image: item.image,
        }) }}
      />
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">{name}{recently && <span className="text-xs rounded bg-amber-200 text-amber-900 px-2 py-0.5">{t.labels?.updated ?? 'Updated'}</span>}</h1>
            {summary && <p className="text-sm opacity-80">{summary}</p>}
          </div>
          <FavoriteButton id={`${cat.id}:${item.id}`} label={name} />
        </div>
      </header>
      {item.image && (
        <Suspense fallback={<Skeleton className="w-full h-60" />}>
          <ResponsiveImage src={item.image} alt={name} width={800} height={500} className="w-full" priority />
        </Suspense>
      )}

      <div className="flex flex-wrap gap-3">
        {tel && (
          <CTAButton as-child="true" aria-label={`${t.cta.call} ${name}`}>{/* anchor inside for semantics */}
            <a href={tel}>{t.cta.call}</a>
          </CTAButton>
        )}
        {maps && (
          <CTAButton variant="secondary" as-child="true" aria-label={`${t.cta.directions} ${name}`}>
            <a href={maps} target="_blank">{t.cta.directions}</a>
          </CTAButton>
        )}
    {website && (
          <CTAButton variant="primary" as-child="true" aria-label={`${t.cta.website} ${name}`}>
      <a href={website} target="_blank">{t.cta.website}</a>
          </CTAButton>
        )}
    {reservationUrl && (
          <CTAButton variant="outline" as-child="true" aria-label={`${t.cta.reserve} ${name}`}>
      <a href={reservationUrl} target="_blank">{t.cta.reserve}</a>
          </CTAButton>
        )}
        <ShareButton title={name} text={summary} />
      </div>
      {/* Sticky action bar for mobile */}
  <div className="fixed inset-x-0 bottom-0 md:hidden safe-bottom px-4 pb-3 pt-2 bg-white/90 backdrop-blur border-t border-soft flex gap-2 overflow-x-auto">
    {tel && <a href={tel} className="flex-1 text-center rounded bg-brand-600 text-white py-2 text-sm" aria-label={`${t.cta.call} ${name}`}>{t.cta.call}</a>}
    {maps && <a href={maps} target="_blank" className="flex-1 text-center rounded bg-emerald-600 text-white py-2 text-sm" aria-label={`${t.cta.directions} ${name}`}>{t.cta.directions}</a>}
  {website && <a href={website} target="_blank" className="flex-1 text-center rounded bg-brand-800 text-white py-2 text-sm" aria-label={`${t.cta.website} ${name}`}>{t.cta.website}</a>}
      </div>

  {address && <p className="text-sm">{address}</p>}
  <Suspense fallback={<Skeleton className="w-full h-40" />}>
    <MapEmbed lat={item.location?.lat} lng={item.location?.lng} name={name} mapsHref={maps} />
  </Suspense>

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.tags.map((tp) => (
            <span key={tp} className="text-xs rounded-full px-2 py-1 border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]">{tp}</span>
          ))}
        </div>
      )}

      <nav className="pt-2 flex gap-4">
  <Link href={`/${eff}/${cat.slug}`} className="text-sm text-brand-700 hover:text-brand-800 transition-colors">← {t.categories[cat.slug as "phones" | "restaurants" | "sightseeing"] ?? cat.title}</Link>
  <Link href={`/${eff}`} className="text-sm text-brand-700 hover:text-brand-800 transition-colors">{t.cta.home}</Link>
      </nav>
    </div>
  );
}

export function generateStaticParams() {
  const params: Array<{ locale: string; category: string; slug: string }> = [];
  for (const c of categories) {
    const items = getItemsByCategory(c.id);
    for (const i of items) {
      for (const locale of ["en", "el"]) {
        params.push({ locale, category: c.slug, slug: i.slug ?? toSlug(i.name) });
      }
    }
  }
  return params;
}
