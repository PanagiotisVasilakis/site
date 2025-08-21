import Link from "next/link";
import { getCategoriesWithCounts, pickCategoryLocale } from "@/lib/data";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const cats = getCategoriesWithCounts();
  return (
  <main className="mx-auto max-w-3xl p-6 safe-bottom">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t.homeTitle}</h1>
        <p className="text-sm text-gray-600">{t.homeSubtitle}</p>
      </header>
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cats.map((c) => (
          <Link
            key={c.id}
            href={`/${eff}/${c.slug}`}
            className="card p-4 flex items-center justify-between transition-colors hover:bg-white/90"
          >
            <div>
              <div className="text-lg font-medium text-teal-800">{t.categories[c.slug as "phones" | "restaurants" | "sightseeing"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title)}</div>
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
    </main>
  );
}
