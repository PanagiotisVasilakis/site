"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { EmptyPanel } from '@/components/ui/EmptyPanel';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { useFavorites } from '@/lib/favorites';
import { GuideCard } from './GuideCard';
import type { GuideEntry } from './guideEntries';

/**
 * identity §9.5 favourites: the saved GuideCards (the favourites store lives in this browser), or the
 * EmptyPanel "No favourites yet. Tap the heart on any place." with a link to the guide.
 */
export default function FavoritesList({ entries, locale }: { entries: GuideEntry[]; locale: string }) {
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const { favorites } = useFavorites();
  const saved = useMemo(() => entries.filter((entry) => favorites.has(entry.favoriteId)), [entries, favorites]);

  if (saved.length === 0) {
    return (
      <EmptyPanel
        variant="panel"
        icon="heart"
        title={t.guide.favouritesEmptyTitle}
        action={<Link href={`/${eff}/moments`} className="ui-btn ui-btn--secondary ui-btn--md">{t.guide.browseGuide}</Link>}
      >
        {t.guide.favouritesEmptyText}
      </EmptyPanel>
    );
  }
  return (
    <div className="guide-grid">
      {saved.map((entry, index) => <GuideCard key={entry.favoriteId} entry={entry} locale={eff} index={index} />)}
    </div>
  );
}
