import { Suspense } from "react";
import { categories } from "@/data/categories";
import { getItem, mapsHref, telHref, getItemsByCategory, toSlug, pickLocale, isRecentlyUpdated } from "@/lib/data";
import { absUrl, normalizeExternalUrl } from "@/lib/site";
import { ResponsiveImage } from "@/components/ResponsiveImage";
import { CTAButton } from "@/components/CTAButton";
import { Skeleton } from "@/components/Skeleton";
import FavoriteButton from "@/components/FavoriteButton";
import ShareButton from "@/components/ShareButton";
import DescriptionBox from "@/components/DescriptionBox";
import { MomentsDetailLayout } from "@/components/moments";
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

  const name = pickLocale(item, "name", eff) ?? item.name;
  const summary = pickLocale(item, "summary", eff) ?? item.summary;
  const address = pickLocale(item, "address", eff) ?? item.address;
  const description = pickLocale(item, "description", eff) ?? item.description;
  const descriptionTitle = pickLocale(item, "descriptionTitle", eff) ?? item.descriptionTitle;

  const recently = isRecentlyUpdated(item);
  const heroImage = item.heroImage ?? item.image;

  // Use centralized layout for moments category
  if (cat.slug === 'moments') {
    // Compute URLs server-side to avoid client-side node imports
    const momentsTel = telHref(item.phone);
    const momentsMaps = item.directionsUrl || mapsHref(item.address, item.location?.lat, item.location?.lng);
    const momentsWebsite = normalizeExternalUrl(item.website);
    const momentsReservationUrl = normalizeExternalUrl(item.reservationUrl);

    return (
      <MomentsDetailLayout
        item={{
          id: item.id,
          name,
          summary,
          image: item.image,
          heroImage: item.heroImage,
          heroImagePosition: item.heroImagePosition,
          tags: item.tags,
          descriptionTitle,
          description,
        }}
        categorySlug={cat.slug}
        isRecentlyUpdated={recently}
        urls={{
          tel: momentsTel,
          maps: momentsMaps,
          website: momentsWebsite,
          reservationUrl: momentsReservationUrl,
          schemaUrl: absUrl(`/${eff}/${cat.slug}/${slug}`),
        }}
        translations={{
          cta: t.cta,
          labels: t.labels,
        }}
      />
    );
  }

  // Default layout for other categories
  const tel = telHref(item.phone);
  const maps = item.directionsUrl || mapsHref(item.address, item.location?.lat, item.location?.lng);
  const website = normalizeExternalUrl(item.website);
  const reservationUrl = normalizeExternalUrl(item.reservationUrl);

  return (
    <div className="page-container mx-auto max-w-7xl space-y-6 safe-bottom">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Place',
            name,
            description: summary,
            address,
            url: absUrl(`/${eff}/${cat.slug}/${slug}`),
            telephone: item.phone,
            aggregateRating: item.rating ? { '@type': 'AggregateRating', ratingValue: item.rating } : undefined,
            image: heroImage,
          })
        }}
      />
      <header className="flex flex-col gap-2 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif italic font-bold flex items-center gap-2">{name}{recently && <span className="text-xs rounded bg-amber-200 text-amber-900 px-2 py-0.5">{t.labels?.updated ?? 'Updated'}</span>}</h1>
            {summary && <p className="text-body text-sm">{summary}</p>}
          </div>
        </div>
      </header>
      {heroImage && (
        <Suspense fallback={<Skeleton className="w-full h-60" />}>
          <ResponsiveImage src={heroImage} alt={name} width={800} height={500} className="w-full" priority />
        </Suspense>
      )}

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
        {tel && (
          <CTAButton variant="primary" asChild aria-label={`${t.cta.call} ${name}`}>
            <a href={tel}>{t.cta.call}</a>
          </CTAButton>
        )}
        {maps && (
          <CTAButton variant="primary" asChild aria-label={`${t.cta.directions} ${name}`}>
            <a href={maps} target="_blank">{t.cta.directions}</a>
          </CTAButton>
        )}
        {website && (
          <CTAButton variant="primary" asChild aria-label={`${t.cta.website} ${name}`}>
            <a href={website} target="_blank">{t.cta.website}</a>
          </CTAButton>
        )}
        {reservationUrl && (
          <CTAButton variant="primary" asChild aria-label={`${t.cta.reserve} ${name}`}>
            <a href={reservationUrl} target="_blank">{t.cta.reserve}</a>
          </CTAButton>
        )}
        <ShareButton title={name} text={summary} className="btn-primary" />
        <FavoriteButton id={`${cat.id}:${item.id}`} label={name} />
      </div>

      <DescriptionBox title={descriptionTitle} description={description} />

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-4">
          {item.tags.map((tp) => (
            <span key={tp} className="text-xs rounded-full px-2 py-1 border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]">{tp}</span>
          ))}
        </div>
      )}
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
