"use client";

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Chip } from '@/components/ui/Chip';
import { EmptyPanel } from '@/components/ui/EmptyPanel';
import { Segmented, segmentedItemClass } from '@/components/ui/Segmented';
import type { MapContentItem } from '@/data/mapLocations';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { useFavorites } from '@/lib/favorites';
import { filterBySearchText } from '@/lib/searchText';
import { GuideCard } from './GuideCard';
import type { GuideEntry } from './guideEntries';
import { chipCounts, filterByCategory, type GuideFilterKey } from './guideFilters';

/*
 * Leaflet, its CSS and the map module load only when the Map view is chosen (§9.5, §12 R3-V8): this chunk
 * is requested on the first render of <GuideMap>, which only the map view renders.
 */
const GuideMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => <div className="map-placeholder guide-map__frame" aria-hidden />,
});

type View = 'list' | 'map';

function toMapItem(entry: GuideEntry): MapContentItem {
  return {
    categorySlug: entry.categorySlug,
    meta: [entry.categoryLabel, entry.distanceText].filter(Boolean).join(' · '),
    item: {
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      summary: entry.summary,
      address: entry.address,
      phone: entry.phones[0],
      phones: entry.phones,
      website: entry.website,
      directionsUrl: entry.directionsUrl,
      tags: entry.tags,
      location: entry.location,
    },
  };
}

/**
 * identity §8 GuideFilters + the §9.5 list: a search field (`type="search"`, Esc clears), category chips
 * with counts (only categories with content), and the List/Map Segmented; client-side filtering over the
 * server-rendered, distance-sorted entries; the result count in a polite live region; an EmptyPanel with
 * "Clear filters". The map view keeps `?map=1` in the URL and lists the numbered places below the map,
 * then the matching places without coordinates (no pin), so every counted place stays reachable.
 */
export default function GuideList({ entries, locale, cartoBasemapsKey }: { entries: GuideEntry[]; locale: string; cartoBasemapsKey?: string }) {
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuideFilterKey>('all');
  const [view, setView] = useState<View>('list');
  const unplacedLabelId = useId();

  // ?map=1 opens the map view (existing URL contract); the view is written back without a navigation.
  // ?q= is the search submitted from the stay hub's guide tile (identity §9.4).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('map') === '1') setView('map');
    const submitted = params.get('q')?.trim().slice(0, 100);
    if (submitted) setQuery(submitted);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (view === 'map') params.set('map', '1'); else params.delete('map');
    const search = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  }, [view]);

  const chips = useMemo(() => chipCounts(entries), [entries]);
  const results = useMemo(
    () => filterBySearchText(filterByCategory(entries, filter), query),
    [entries, filter, query],
  );
  const mapped = useMemo(() => results.filter((entry) => entry.location), [results]);
  const unplaced = useMemo(() => results.filter((entry) => !entry.location), [results]);
  const mapItems = useMemo(() => mapped.map(toMapItem), [mapped]);
  const countText = results.length === 1
    ? t.guide.resultsOne
    : t.guide.resultsOther.replace('{count}', String(results.length));
  const clear = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <div className="guide-list">
      <div className="guide-filters">
        <label className="guide-search">
          <span className="sr-only">{t.guide.searchLabel}</span>
          <Icon name="search" size={20} className="guide-search__icon" />
          <input
            type="search"
            className="guide-search__input"
            value={query}
            placeholder={t.guide.searchPlaceholder}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                setQuery('');
              }
            }}
          />
        </label>
        <div className="guide-filters__row">
          {chips.length > 1 ? (
            <div className="guide-chips" role="group" aria-label={t.guide.filtersLabel}>
              {chips.map(({ key, count }) => (
                <Chip key={key} pressed={filter === key} count={count} onClick={() => setFilter(key)}>
                  {t.momentsFilters[key]}
                </Chip>
              ))}
            </div>
          ) : null}
          <Segmented label={t.guide.viewLabel} className="guide-view">
            {(['list', 'map'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={segmentedItemClass}
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                <Icon name={option === 'list' ? 'grid' : 'map'} size={16} />
                {option === 'list' ? t.ui.list : t.ui.map}
              </button>
            ))}
          </Segmented>
        </div>
        <p className="guide-count" role="status" aria-live="polite">{countText}</p>
      </div>

      {results.length === 0 ? (
        <EmptyPanel
          variant="panel"
          icon="search"
          title={t.guide.noResultsTitle}
          action={<button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={clear}>{t.guide.clearFilters}</button>}
        >
          {t.guide.noResultsText}
        </EmptyPanel>
      ) : view === 'list' ? (
        <div className="guide-grid">
          {results.map((entry, index) => (
            <GuideCard key={entry.id} entry={entry} locale={eff} index={index} priority={index === 0} titleAs="h2" />
          ))}
        </div>
      ) : (
        <div className="guide-map">
          <div className="guide-map__frame">
            <GuideMap locale={eff} height="100%" zoom={14} contentItems={mapItems} cartoBasemapsKey={cartoBasemapsKey} numbered />
          </div>
          {mapped.length > 0 ? (
            <>
              <p className="guide-map__note">{t.guide.mapNote}</p>
              <ol className="guide-map__list" aria-label={t.guide.mapListLabel}>
                {mapped.map((entry, index) => (
                  <li key={entry.id} className="guide-map__item" style={{ '--i': index } as CSSProperties}>
                    <span className="guide-map__num" aria-hidden>{index + 1}</span>
                    <span className="guide-map__text">
                      <Link href={entry.href} className="guide-map__link shell-link">{entry.name}</Link>
                      <span className="guide-map__meta">{[entry.categoryLabel, entry.distanceText].filter(Boolean).join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {unplaced.length > 0 ? (
            <>
              <p id={unplacedLabelId} className="guide-map__note">{t.guide.mapUnplacedLabel}</p>
              <ul className="guide-map__list" aria-labelledby={unplacedLabelId}>
                {unplaced.map((entry, index) => (
                  <li key={entry.id} className="guide-map__item" style={{ '--i': mapped.length + index } as CSSProperties}>
                    <span className="guide-map__text">
                      <Link href={entry.href} className="guide-map__link shell-link">{entry.name}</Link>
                      <span className="guide-map__meta">{entry.categoryLabel}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * "Saved" in the guide list header: the way back to /favorites (O41), with the saved count. `favoriteIds`
 * are the ids of every current place, so ids left in the store by removed content are not counted (the
 * favourites page shows only saved ids that resolve to a place).
 */
export function SavedLink({ locale, favoriteIds }: { locale: string; favoriteIds: readonly string[] }) {
  const t = getDictionary(normalizeLocale(locale));
  const { favorites } = useFavorites();
  const count = useMemo(() => favoriteIds.filter((id) => favorites.has(id)).length, [favoriteIds, favorites]);
  return (
    <Link
      href={`/${locale}/favorites`}
      className="guide-saved shell-link"
      aria-label={count > 0 ? t.guide.savedCount.replace('{count}', String(count)) : t.guide.saved}
    >
      <Icon name={count > 0 ? 'heart-filled' : 'heart'} size={18} />
      <span aria-hidden>{t.guide.saved}</span>
      {count > 0 ? <span className="guide-saved__count" aria-hidden>{count}</span> : null}
    </Link>
  );
}
