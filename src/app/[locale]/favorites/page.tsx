import { categories } from '@/data/categories';
import { getItemsByCategory, pickLocale, toSlug } from '@/lib/data';
import { getDictionary } from '@/i18n/dictionaries';
import { locales, type Locale } from '@/i18n/config';
import Link from 'next/link';
import FavoritesClient from '@/components/FavoritesClient';

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const t = getDictionary(eff);
  const allItems = categories.flatMap(cat => {
    const items = getItemsByCategory(cat.id);
    return items.map(i => ({
      id: i.id,
      title: pickLocale(i as unknown as Record<string, unknown>, 'name', eff) || i.name,
      subtitle: pickLocale(i as unknown as Record<string, unknown>, 'summary', eff) || i.summary,
      rating: i.rating,
      price: i.priceLevel ? '€'.repeat(i.priceLevel) : undefined,
      icon: cat.icon,
      href: `/${eff}/${cat.slug}/${i.slug || toSlug(i.name)}`,
      favoriteId: `${cat.slug}:${i.id}`,
    }));
  });
  return (
    <div className="mx-auto max-w-4xl p-6">
      <FavoritesClient
        allItems={allItems}
        emptyLabel={t.emptyState}
        titleLabel={t.labels?.favorites || 'Favorites'}
        locale={eff}
      />
      <nav className="pt-6">
        <Link href={`/${eff}`} className="text-sm" style={{color:'var(--brand-700)'}}>{t.backHome}</Link>
      </nav>
    </div>
  );
}

export function generateStaticParams() {
  return ['en','el'].map(locale => ({ locale }));
}
