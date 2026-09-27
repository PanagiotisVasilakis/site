import { categories } from "@/data/categories";
import { getItem, getItemsByCategory, toSlug, pickLocale, isRecentlyUpdated } from "@/lib/data";
import { mapsHref, telHref } from "@/lib/contactLinks";
import { absUrl } from "@/lib/site";
import { MomentsDetailLayout } from "@/components/moments";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import { headers } from 'next/headers';
import { localizedAlternates } from '@/lib/seo';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; category: string; slug: string }> }): Promise<Metadata> {
  const { locale, category, slug } = await params;
  const eff = normalizeLocale(locale);
  const cat = categories.find((candidate) => candidate.slug === category);
  const item = cat ? getItem(cat.id, slug) : undefined;
  if (!cat || !item) return { robots: { index: false, follow: false } };
  const dictionary = getDictionary(eff);
  const title = pickLocale(item, 'name', eff) ?? item.name;
  const description = pickLocale(item, 'summary', eff) ?? item.summary;
  const suffix = `/${cat.slug}/${slug}`;
  const image = item.heroImage ?? item.image;
  return {
    title: `${title} | ${dictionary.appTitle}`,
    description,
    alternates: localizedAlternates(eff, suffix),
    openGraph: {
      title,
      description,
      url: `/${eff}${suffix}`,
      locale: eff,
      type: 'website',
      images: image ? [{ url: image, alt: title }] : undefined,
    },
  };
}

export const dynamic = 'force-dynamic';
export default async function ItemPage({ params }: { params: Promise<{ locale: string; category: string; slug: string }> }) {
  const { locale, category, slug } = await params;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const eff = normalizeLocale(locale);
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

  // One layout for every category; phones add their contact fields to the structured data.
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
      locale={eff}
      isRecentlyUpdated={recently}
      urls={{
        tel: telHref(item.phone),
        maps: item.directionsUrl || mapsHref(item.address, item.location?.lat, item.location?.lng),
        website: item.website || undefined,
        reservationUrl: item.reservationUrl || undefined,
        schemaUrl: absUrl(`/${eff}/${cat.slug}/${slug}`),
      }}
      translations={{
        cta: t.cta,
        labels: t.labels,
        momentTags: t.momentTags,
      }}
      structuredData={cat.slug === 'moments' ? undefined : {
        address,
        telephone: item.phone,
        aggregateRating: item.rating ? { '@type': 'AggregateRating', ratingValue: item.rating } : undefined,
        image: heroImage,
      }}
      nonce={nonce}
    />
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
