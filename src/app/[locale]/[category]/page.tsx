import Link from "next/link";
import GuideList, { SavedLink } from '@/components/guide/GuideList';
import { PhonesDirectory } from '@/components/guide/PhonesDirectory';
import { favoriteIdOf, sortByDistance, toGuideEntry } from '@/components/guide/guideEntries';
import { EmptyPanel } from '@/components/ui/EmptyPanel';
import { categories } from "@/data/categories";
import { getItemsByCategory, pickCategoryLocale } from "@/lib/data";
import { notFound } from "next/navigation";
import { getDictionary, type Dictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import type { Category } from '@/data/schemas';
import type { Locale } from '@/i18n/config';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';

/** The page title and lead: the guide (§9.5) and the phones page (§9.6) have their own; other categories use their data. */
function pageCopy(cat: Category, locale: Locale, t: Dictionary): { title: string; lead?: string } {
  if (cat.slug === 'moments') return { title: t.guide.title, lead: t.guide.lead };
  if (cat.slug === 'phones') return { title: t.guide.phonesTitle, lead: t.guide.phonesLead };
  return {
    title: pickCategoryLocale(cat, 'title', locale) ?? cat.title,
    lead: pickCategoryLocale(cat, 'description', locale) ?? cat.description,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; category: string }> }): Promise<Metadata> {
  const { locale, category } = await params;
  const eff = normalizeLocale(locale);
  const cat = categories.find((candidate) => candidate.slug === category);
  if (!cat) return { robots: { index: false, follow: false } };
  const { title, lead: description } = pageCopy(cat, eff, getDictionary(eff));
  const suffix = `/${cat.slug}`;
  return {
    title,
    description,
    alternates: localizedAlternates(eff, suffix),
    openGraph: localizedOpenGraph(eff, suffix),
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; category: string }> }) {
  const { locale, category } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return notFound();
  const items = getItemsByCategory(cat.id);
  const entries = sortByDistance(items.map((item) => toGuideEntry(item, cat, eff, t)));
  const { title, lead } = pageCopy(cat, eff, t);
  // The Saved count covers only ids that still resolve to a place, like the favourites page (all categories).
  const knownFavoriteIds = categories.flatMap((c) => getItemsByCategory(c.id).map((item) => favoriteIdOf(c, item)));

  if (cat.slug === 'phones' && entries.length > 0) {
    return <PhonesDirectory entries={entries} locale={eff} title={title} lead={lead} />;
  }

  return (
    <div className="guide-page">
      <header className="guide-head">
        <div className="guide-head__text">
          <h1 className="guide-head__title">{title}</h1>
          {lead ? <p className="guide-head__lead">{lead}</p> : null}
        </div>
        <SavedLink locale={eff} favoriteIds={knownFavoriteIds} />
      </header>

      {entries.length === 0 ? (
        <EmptyPanel
          variant="panel"
          icon="info"
          title={t.emptyState}
          action={<Link href={`/${eff}`} className="ui-btn ui-btn--secondary ui-btn--md">{t.cta.home}</Link>}
        >
          {t.labels.contentUpdating}
        </EmptyPanel>
      ) : (
        <GuideList
          entries={entries}
          locale={eff}
          cartoBasemapsKey={process.env.CARTO_BASEMAPS_KEY || undefined}
        />
      )}
    </div>
  );
}
