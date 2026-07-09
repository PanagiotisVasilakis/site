"use client";
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { TagFilters } from '@/components/TagFilters';
import ListingCard from '@/components/ListingCard';
import FilterDrawer from '@/components/FilterDrawer';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';
import dynamic from 'next/dynamic';
import { EmptyState, MomentCard, MomentsToolbar } from '@/components/moments';
import { filterMomentsByCategory, type MomentsFilterKey } from '@/components/moments/MomentsFilterMenu';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

// Dynamic import for map component - only loads when needed
const ApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] surface-subtle rounded-lg flex items-center justify-center">
      <div className="text-sm text-subtle">Loading map...</div>
    </div>
  )
});

interface Item {
  id: string;
  slug: string;
  name: string;
  summary?: string;
  rating?: number;
  price?: string;
  tags?: string[];
  featured?: boolean;
  icon?: string;
  image?: string;
  heroImage?: string;
  heroImagePosition?: string;
  description?: string;
  phone?: string;
  phones?: string[];
  address?: string;
  location?: { lat: number; lng: number };
  website?: string;
  directionsUrl?: string;
  sourceUrls?: string[];
  priceLevel?: number;
  hideAddressOnFront?: boolean;
  categorySlug: string;
}

interface Props {
  items: Item[];
  locale: string;
  emptyLabel: string;
  categorySlug: string;
  phonesLayout?: boolean;
  momentsLayout?: boolean;
  ui?: { filters: string; map: string; list: string; resetAll: string; activeTags: string; none: string; };
  cardLabels?: {
    viewDetails: string;
    back: string;
    call: string;
    directions: string;
    website: string;
  };
  momentsFilters?: { all: string; beaches: string; museums: string; restaurants: string; bars: string; brunchs: string; taygetos: string; sites: string; nearby: string; };
}


function CategoryGridClientComponent({ items, locale, emptyLabel, categorySlug, ui, cardLabels, phonesLayout, momentsLayout, momentsFilters }: Props) {
  const t = useMemo(() => getDictionary(locale as Locale), [locale]);
  const categoryLabel = t.categories?.[categorySlug as "phones" | "moments"] ?? categorySlug;
  const [active, setActive] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [momentsFilter, setMomentsFilter] = useState<MomentsFilterKey>('all');
  const [momentsSearch, setMomentsSearch] = useState('');
  // URL persistence
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tags = params.get('tags');
    const map = params.get('map');
    if (tags) setActive(tags.split(',').filter(Boolean));
    if (map === '1') setShowMap(true);
  }, []);
  useEffect(() => {
    if (phonesLayout) setShowMap(false);
  }, [phonesLayout]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (active.length > 0) params.set('tags', active.join(',')); else params.delete('tags');
    if (showMap) params.set('map', '1'); else params.delete('map');
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [active, showMap]);
  const filtered = useMemo(() => {
    if (active.length === 0) return items;
    return items.filter(i => i.tags?.some(t => active.includes(t)));
  }, [items, active]);
  const momentsCategoryFiltered = useMemo(
    () => filterMomentsByCategory(items, momentsFilter),
    [items, momentsFilter]
  );
  const momentsFiltered = useMemo(() => {
    const query = momentsSearch.trim().toLowerCase();
    if (!query) return momentsCategoryFiltered;

    return momentsCategoryFiltered.filter(item => {
      const haystack = [
        item.name,
        item.summary,
        item.description,
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [momentsCategoryFiltered, momentsSearch]);
  const featured = filtered.filter(i => i.featured);
  const rest = filtered.filter(i => !i.featured);
  // Progressive reveal for large groups (only apply to non-featured group) to reduce initial paint cost
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setVisibleCount(24); }, [filtered]);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisibleCount(v => Math.min(v + 24, rest.length));
      }
    }, { rootMargin: '600px 0px 600px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rest.length]);

  const renderMomentCard = (i: Item, index: number) => (
    <MomentCard
      key={i.id}
      id={i.id}
      slug={i.slug}
      name={i.name}
      summary={i.summary}
      description={i.description}
      rating={i.rating}
      price={i.price}
      icon={i.icon}
      image={i.image}
      heroImage={i.heroImage}
      heroImagePosition={i.heroImagePosition}
      priority={index === 0}
      tags={i.tags}
      address={i.address}
      location={i.location}
      directionsUrl={i.directionsUrl}
      phone={i.phone}
      phones={i.phones}
      website={i.website}
      hideAddressOnFront={i.hideAddressOnFront}
      categorySlug={categorySlug}
      locale={locale}
      labels={cardLabels}
    />
  );

  const renderMomentsToolbar = () => (
    <MomentsToolbar
      search={momentsSearch}
      onSearchChange={setMomentsSearch}
      activeFilter={momentsFilter}
      onFilterChange={setMomentsFilter}
      showMap={showMap}
      onMapToggle={() => setShowMap(m => !m)}
      mapLabel={ui?.map || 'Map'}
      listLabel={ui?.list || 'List'}
      searchAndFilterLabel={t.moments?.searchAndFilter}
      searchMomentsLabel={t.moments?.searchMoments}
      searchPlaceholder={t.moments?.searchPlaceholder}
      filterByCategoryLabel={t.moments?.filterByCategory}
      filters={momentsFilters}
    />
  );

  const renderGroup = useCallback((group: Item[], progressive = false) => {
    if (group.length === 0) return null;
    const slice = progressive ? group.slice(0, visibleCount) : group;
    return (
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] mb-8" aria-busy={progressive && slice.length < group.length}>
        {slice.map(i => (
          <ListingCard
            key={i.id}
            id={i.id}
            title={i.name}
            subtitle={i.summary}
            rating={i.rating}
            price={i.price}
            icon={i.icon}
            href={`/${locale}/${categorySlug}/${i.slug}`}
            favoriteId={`${categorySlug}:${i.id}`}
            favLabelAdd={t.labels?.addFavorite ?? 'Add to favorites'}
            favLabelRemove={t.labels?.removeFavorite ?? 'Remove favorite'}
            addedToast={t.labels?.addedFavorite ?? 'Added to favorites'}
            removedToast={t.labels?.removedFavorite ?? 'Removed from favorites'}
          />
        ))}
        {progressive && slice.length < group.length && (
          <div ref={loadMoreRef} className="col-span-full flex justify-center py-4 text-xs opacity-60 loading-sentinel">{t.labels?.loadingMore ?? 'Loading more…'}</div>
        )}
      </div>
    );
  }, [visibleCount, locale, categorySlug, t]);
  return (
    <div>
      {!(phonesLayout || momentsLayout) && (
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {!(phonesLayout || momentsLayout) && (
            <button onClick={() => setFiltersOpen(true)} className="btn-tint btn-sm">{ui?.filters || 'Filters'}</button>
          )}
          <button onClick={() => setShowMap(m => !m)} className="btn-tint btn-sm">{showMap ? (ui?.list || 'List') : (ui?.map || 'Map')}</button>
        </div>
      </div>
      )}

      {!(phonesLayout || momentsLayout) && (
        <div className="mb-3">
          <TagFilters items={items.map(i => ({ tags: i.tags }))} active={active} onChange={setActive} resetLabel={t.ui?.resetAll} />
        </div>
      )}

      {/* Phones layout: moments-style grid */}
      {categorySlug === 'phones' && phonesLayout ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          <div className={momentsLayoutConfig.grid.gridClass}>
            {items.map(renderMomentCard)}
          </div>
        </div>
      ) : null}
      {/* Moments layout */}
      {categorySlug === 'moments' && momentsLayout && !showMap ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          {renderMomentsToolbar()}
          <div className={momentsLayoutConfig.grid.gridClass}>
            {momentsFiltered.map(renderMomentCard)}
          </div>
          {momentsFiltered.length === 0 && (
            <EmptyState
              message={t.moments?.noPlaces}
              clearLabel={t.moments?.clearSearch}
              onClear={momentsSearch ? () => setMomentsSearch('') : undefined}
            />
          )}
        </div>
      ) : null}
      {categorySlug === 'moments' && momentsLayout && showMap ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          {renderMomentsToolbar()}
          <div className="moments-map-panel">
            <ApartmentLocationMap
              locale={locale}
              height="420px"
              zoom={13}
              className="moments-map-frame"
              contentItems={momentsFiltered.map((item) => ({ item, categorySlug }))}
            />
            <p className="moments-map-caption">
              {(t.moments?.mapCaption ?? 'Apartment location and nearby {category}. Zoom and click markers for details.').replace('{category}', categoryLabel)}
            </p>
          </div>
          {momentsFiltered.length === 0 && (
            <EmptyState
              message={t.moments?.noPlaces}
              clearLabel={t.moments?.clearSearch}
              onClear={momentsSearch ? () => setMomentsSearch('') : undefined}
            />
          )}
        </div>
      ) : null}
      {showMap && !(categorySlug === 'moments' && momentsLayout) && (
        <div className="mb-6">
          <ApartmentLocationMap
            locale={locale}
            height="400px"
            zoom={13}
            className="rounded-lg overflow-hidden shadow-sm"
            contentItems={filtered.map((item) => ({ item, categorySlug }))}
          />
          <div className="mt-3 text-center">
            <p className="text-sm text-subtle">
              {(t.moments?.mapCaptionShort ?? '🏡 Apartment location and nearby {category} • Zoom and click markers for details').replace('{category}', categoryLabel)}
            </p>
          </div>
        </div>
      )}
      {/* Skeleton while no items loaded (initial mount) */}
      {items.length === 0 && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] mb-8">
          {Array.from({ length: 6 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      )}
      {/* For non-phones and non-moments categories, render Featured/other groups and FilterDrawer as before */}
      {!(categorySlug === 'phones' && phonesLayout) && !(categorySlug === 'moments' && momentsLayout) && (
        <>
          {featured.length > 0 && (
            <section>
              <h2 className="text-sm font-serif italic font-bold mb-2 text-small-strong">{t.labels?.featured ?? 'Featured'}</h2>
              {renderGroup(featured)}
            </section>
          )}
          {renderGroup(rest, true)}
          {filtered.length === 0 && (
            <div className="text-xs text-subtle px-2">{emptyLabel}</div>
          )}
          <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={ui?.filters || 'Filters'} closeLabel={t.ui?.closeFilters} doneLabel={t.ui?.done}>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-serif italic font-bold mb-1 text-small-strong">{ui?.activeTags || 'Active Tags'}</h3>
                {active.length === 0 && <div className="text-xs opacity-50">{ui?.none || 'None'}</div>}
                {active.length > 0 && (
                  <ul className="flex flex-wrap gap-1">
                    {active.map(tag => (
                      <li key={tag} className="tag-filter is-on flex items-center gap-1">{tag}<button aria-label={(t.moments?.removeTag ?? 'Remove {tag}').replace('{tag}', tag)} onClick={() => setActive(prev => prev.filter(x => x !== tag))}>✕</button></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <button onClick={() => { setActive([]); }} className="text-xs underline">{ui?.resetAll || 'Reset All'}</button>
              </div>
            </div>
          </FilterDrawer>
        </>
      )}
    </div>
  );
}
export default memo(CategoryGridClientComponent);
