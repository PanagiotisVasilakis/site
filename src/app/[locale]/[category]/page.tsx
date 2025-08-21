import Link from "next/link";
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
  const featured = items.filter((i) => i.featured);
  const rest = items.filter((i) => !i.featured);

  return (
  <main className="mx-auto max-w-3xl p-6 safe-bottom">
      <header className="mb-4">
  <h1 className="text-2xl font-semibold text-teal-800">{t.categories[cat.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(cat, "title", eff) ?? cat.title)}</h1>
  {(pickCategoryLocale(cat, "description", eff) ?? cat.description) && <p className="text-sm text-gray-600">{pickCategoryLocale(cat, "description", eff) ?? cat.description}</p>}
      </header>

      {items.length === 0 && (
        <div className="card p-6 text-sm text-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span aria-hidden>🗒️</span>
            <span>{t.emptyState}</span>
          </div>
          <Link href={`/${locale}`} className="text-teal-700">{t.cta.home}</Link>
        </div>
      )}

      {[featured, rest].map((list, idx) => (
        <section className="space-y-2 mb-6" key={idx}>
          {list.map((i) => (
            <Link
              key={i.id}
              href={`/${eff}/${cat.slug}/${i.slug ?? toSlug(i.name)}`}
              className="block card p-4 hover:bg-white/90"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-teal-900">{pickLocale(i, "name", eff) ?? i.name}</div>
                  {(pickLocale(i, "summary", eff) ?? i.summary) && (
                    <div className="text-xs text-gray-600">{pickLocale(i, "summary", eff) ?? i.summary}</div>
                  )}
                </div>
                <div className="text-sm text-teal-700">{t.details}</div>
              </div>
            </Link>
          ))}
        </section>
      ))}

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
