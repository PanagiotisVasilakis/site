import Link from "next/link";
import { categories } from "@/data/categories";
import { getItem, mapsHref, telHref, getItemsByCategory, toSlug, pickLocale } from "@/lib/data";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";

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

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4 safe-bottom">
      <header>
        <h1 className="text-2xl font-semibold text-teal-800">{name}</h1>
        {summary && <p className="text-sm text-gray-600">{summary}</p>}
      </header>

    <div className="flex flex-wrap gap-3">
        {tel && (
      <a href={tel} className="px-4 py-3 rounded bg-teal-600 text-white text-base sm:text-sm">{t.cta.call}</a>
        )}
        {maps && (
      <a href={maps} target="_blank" className="px-4 py-3 rounded bg-emerald-600 text-white text-base sm:text-sm">{t.cta.directions}</a>
        )}
        {item.website && (
      <a href={item.website} target="_blank" className="px-4 py-3 rounded bg-teal-800 text-white text-base sm:text-sm">{t.cta.website}</a>
        )}
        {item.reservationUrl && (
      <a href={item.reservationUrl} target="_blank" className="px-4 py-3 rounded border border-teal-300 text-teal-800 text-base sm:text-sm">{t.cta.reserve}</a>
        )}
      </div>

  {address && <p className="text-sm text-gray-700">{address}</p>}

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.tags.map((tp) => (
            <span key={tp} className="text-xs rounded-full px-2 py-1 border border-teal-200 text-teal-800 bg-white/70">{tp}</span>
          ))}
        </div>
      )}

      <nav className="pt-2 flex gap-4">
  <Link href={`/${eff}/${cat.slug}`} className="text-sm text-teal-700">← {t.categories[cat.slug as "phones" | "restaurants" | "sightseeing"] ?? cat.title}</Link>
  <Link href={`/${eff}`} className="text-sm text-teal-700">{t.cta.home}</Link>
      </nav>
    </main>
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
