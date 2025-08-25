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

  return (
    <main className="mx-auto max-w-3xl p-6 safe-bottom">
      <header className="mb-4">
  <h1 className="text-2xl font-semibold text-teal-800">{t.categories[cat.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(cat, "title", eff) ?? cat.title)}</h1>
  {(pickCategoryLocale(cat, "description", eff) ?? cat.description) && <p className="text-sm text-gray-600">{pickCategoryLocale(cat, "description", eff) ?? cat.description}</p>}
      </header>

      {items.length === 0 && (
        <div className="card p-6 text-sm text-gray-700 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden>🗒️</span>
            <span>{t.emptyState}</span>
          </div>
          <div className="text-xs text-gray-500">Content updating – please check again later.</div>
          <div>
            <Link href={`/${locale}`} className="text-teal-700 underline">{t.cta.home}</Link>
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
    emptyLabel={t.emptyState}
    ui={t.ui}
  />

      <nav className="pt-2">
  <Link href={`/${eff}`} className="text-sm text-teal-700">{t.backHome}</Link>
      </nav>
    </main>
  );
}

export function generateStaticParams() {
  const all = [] as Array<{ locale: string; category: string }>;
  for (const c of categories) {
    for (const locale of ["en", "el"]) all.push({ locale, category: c.slug });
  }
  return all;
}
