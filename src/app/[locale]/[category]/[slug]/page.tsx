import { categories } from "@/data/categories";
import { getItem, getItemsByCategory, pickLocale } from "@/lib/data";
import { absUrl } from "@/lib/site";
import { GuideDetail } from '@/components/guide/GuideDetail';
import { nearestTo, toGuideEntry } from '@/components/guide/guideEntries';
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import { headers } from 'next/headers';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; category: string; slug: string }> }): Promise<Metadata> {
  const { locale, category, slug } = await params;
  const eff = normalizeLocale(locale);
  const cat = categories.find((candidate) => candidate.slug === category);
  const item = cat ? getItem(cat.id, slug) : undefined;
  if (!cat || !item) return { robots: { index: false, follow: false } };
  const title = pickLocale(item, 'name', eff) ?? item.name;
  const description = pickLocale(item, 'summary', eff) ?? item.summary;
  const suffix = `/${cat.slug}/${slug}`;
  const image = item.heroImage ?? item.image;
  return {
    title,
    description,
    alternates: localizedAlternates(eff, suffix),
    // The place's own photo when it has one, otherwise the locale share card.
    openGraph: localizedOpenGraph(eff, suffix, image ? [{ url: absUrl(image), alt: title }] : undefined),
  };
}

export default async function ItemPage({ params }: { params: Promise<{ locale: string; category: string; slug: string }> }) {
  const { locale, category, slug } = await params;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return notFound();
  const item = getItem(cat.id, slug);
  if (!item) return notFound();

  const entry = toGuideEntry(item, cat, eff, t);
  const others = getItemsByCategory(cat.id).map((other) => toGuideEntry(other, cat, eff, t));

  // One layout for every category (identity §9.5); phones add their contact fields to the structured data.
  return (
    <GuideDetail
      entry={entry}
      nearby={nearestTo(entry, others, 3)}
      locale={eff}
      backHref={`/${eff}/${cat.slug}`}
      backLabel={cat.slug === 'phones' ? t.guide.phonesTitle : t.guide.title}
      structuredData={{
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: entry.name,
        description: entry.summary,
        url: absUrl(`/${eff}/${cat.slug}/${slug}`),
        image: item.image,
        ...(cat.slug === 'moments' ? {} : {
          address: entry.address,
          telephone: item.phone,
          image: item.heroImage ?? item.image,
        }),
      }}
      nonce={nonce}
    />
  );
}
