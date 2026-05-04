import Link from "next/link";
import CategoryGridClient from '@/components/CategoryGridClient';
import { categories } from "@/data/categories";
import { getItemsByCategory, toSlug, pickLocale, pickCategoryLocale } from "@/lib/data";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; category: string }> }) {
  const { locale, category } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return notFound();
  const items = getItemsByCategory(cat.id);
  // Filtering & segmentation handled client-side now

  const isPhones = cat.slug === 'phones';
  const isMoments = cat.slug === 'moments';
  const useMomentsShell = isPhones || isMoments;
  const pageTitle = isMoments ? "Kalamata Moments" : (t.categories[cat.slug as "phones" | "moments"] ?? (pickCategoryLocale(cat, "title", eff) ?? cat.title));
  const pageDescription = isMoments ? "Curated local recommendations for your stay" : (pickCategoryLocale(cat, "description", eff) ?? cat.description);

  return (
    <div className={useMomentsShell ? "page-container mx-0 max-w-full safe-bottom px-4 moments-page" : "page-container mx-auto max-w-3xl safe-bottom"}>
      <header className={useMomentsShell ? "moments-hero" : "mb-4"}>
        <h1 className={useMomentsShell ? "moments-hero-title" : "text-2xl font-serif italic font-bold page-title"}>{pageTitle}</h1>
        {pageDescription && <p className={useMomentsShell ? "moments-hero-subtitle" : "text-sm opacity-80 text-body"}>{pageDescription}</p>}
      </header>

      {items.length === 0 && (
        <div className="surface-card p-6 text-sm text-body flex flex-col gap-3 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <span aria-hidden>🗒️</span>
            <span>{t.emptyState}</span>
          </div>
          <div className="text-xs text-subtle">Content updating – please check again later.</div>
          <div>
            <Link href={`/${locale}`} className="underline text-brand-700 hover:text-brand-800 transition-colors">{t.cta.home}</Link>
          </div>
        </div>
      )}

      <CategoryGridClient
        items={items.map(i => ({
          id: i.id,
          slug: i.slug ?? toSlug(i.name),
          name: pickLocale(i, 'name', eff) ?? i.name,
          summary: pickLocale(i, 'summary', eff) ?? i.summary,
          tags: i.tags,
          featured: i.featured,
          categorySlug: cat.slug,
          description: pickLocale(i, 'description', eff) ?? i.description,
          rating: i.rating,
          price: i.priceLevel ? '€'.repeat(i.priceLevel) : undefined,
          icon: i.icon ?? cat.icon,
          image: i.image,
          heroImage: i.heroImage,
          heroImagePosition: i.heroImagePosition,
          phone: i.phone,
          phones: i.phones,
          address: pickLocale(i, 'address', eff) ?? i.address,
          location: i.location,
          website: i.website,
          directionsUrl: i.directionsUrl,
          sourceUrls: i.sourceUrls,
          priceLevel: i.priceLevel,
          hideAddressOnFront: cat.slug === 'phones',
        }))}
        locale={eff}
        categorySlug={cat.slug}
        phonesLayout={isPhones}
        momentsLayout={isMoments}
        emptyLabel={t.emptyState}
        ui={t.ui}
        cardLabels={{
          viewDetails: t.map?.viewDetails ?? 'View details',
          back: t.ui?.back ?? 'Back',
          call: t.cta.call,
          directions: t.cta.directions,
          website: t.cta.website,
        }}
        momentsFilters={t.momentsFilters}
      />

    </div>
  );
}

export function generateStaticParams() {
  const all = [] as Array<{ locale: string; category: string }>;
  for (const c of categories) {
    for (const locale of ["en", "el"]) all.push({ locale, category: c.slug });
  }
  return all;
}
