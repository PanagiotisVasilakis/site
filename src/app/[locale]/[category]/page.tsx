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

  return (
    <div className={isPhones ? "page-container mx-0 max-w-full safe-bottom px-4" : "page-container mx-auto max-w-3xl safe-bottom"}>
      <header className={isPhones ? "mb-4 text-center" : "mb-4"}>
        <h1 className="text-2xl font-semibold page-title">{t.categories[cat.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(cat, "title", eff) ?? cat.title)}</h1>
        {(pickCategoryLocale(cat, "description", eff) ?? cat.description) && <p className="text-sm opacity-80 text-body">{pickCategoryLocale(cat, "description", eff) ?? cat.description}</p>}
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
          rating: i.rating,
          price: i.priceLevel ? '€'.repeat(i.priceLevel) : undefined,
          icon: cat.icon,
        }))}
        locale={eff}
        categorySlug={cat.slug}
        phonesLayout={isPhones}
        emptyLabel={t.emptyState}
        ui={t.ui}
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
