import { categories } from '@/data/categories';
import { getItemsByCategory } from '@/lib/data';
import { getDictionary } from '@/i18n/dictionaries';
import { normalizeLocale } from '@/i18n/config';
import FavoritesList from '@/components/guide/FavoritesList';
import { sortByDistance, toGuideEntry } from '@/components/guide/guideEntries';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const dictionary = getDictionary(eff);
  // The list lives on the visitor's device: nothing to index, so not in the sitemap (robots.ts).
  return {
    title: dictionary.guide.favouritesTitle,
    description: dictionary.guide.favouritesLead,
    alternates: localizedAlternates(eff, '/favorites'),
    openGraph: localizedOpenGraph(eff, '/favorites'),
    robots: { index: false, follow: false },
  };
}

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const entries = sortByDistance(categories.flatMap((cat) => (
    getItemsByCategory(cat.id).map((item) => toGuideEntry(item, cat, eff, t))
  )));
  return (
    <div className="guide-page">
      <header className="guide-head">
        <div className="guide-head__text">
          <h1 className="guide-head__title">{t.guide.favouritesTitle}</h1>
          <p className="guide-head__lead">{t.guide.favouritesLead}</p>
        </div>
      </header>
      <FavoritesList entries={entries} locale={eff} />
    </div>
  );
}
