"use client";
import { useState, useMemo, useEffect, memo } from 'react';
import dynamic from 'next/dynamic';
import { EmptyState, MomentCard, MomentsToolbar } from '@/components/moments';
import {
  filterMomentsByCategory,
  MOMENTS_FILTER_KEYS,
  type MomentsFilterKey,
} from '@/components/moments/MomentsFilterMenu';
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
  tags?: string[];
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
  hideAddressOnFront?: boolean;
  categorySlug: string;
}

interface Props {
  items: Item[];
  locale: string;
  categorySlug: string;
  phonesLayout?: boolean;
  momentsLayout?: boolean;
  ui?: { map: string; list: string; resetAll: string; };
  cardLabels?: {
    viewDetails: string;
    back: string;
    call: string;
    directions: string;
    website: string;
  };
  momentsFilters?: { all: string; beaches: string; museums: string; restaurants: string; bars: string; brunchs: string; taygetos: string; sites: string; nearby: string; };
}


function CategoryGridClientComponent({ items, locale, categorySlug, ui, cardLabels, phonesLayout, momentsLayout, momentsFilters }: Props) {
  const t = useMemo(() => getDictionary(locale as Locale), [locale]);
  const categoryLabel = t.categories?.[categorySlug as "phones" | "moments"] ?? categorySlug;
  const [showMap, setShowMap] = useState(false);
  const [momentsFilter, setMomentsFilter] = useState<MomentsFilterKey>('all');
  const [momentsSearch, setMomentsSearch] = useState('');
  // URL persistence
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const map = params.get('map');
    if (map === '1') setShowMap(true);
  }, []);
  useEffect(() => {
    if (phonesLayout) setShowMap(false);
  }, [phonesLayout]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (showMap) params.set('map', '1'); else params.delete('map');
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [showMap]);
  const momentsCategoryFiltered = useMemo(
    () => filterMomentsByCategory(items, momentsFilter),
    [items, momentsFilter]
  );
  const availableMomentsFilters = useMemo(
    () => MOMENTS_FILTER_KEYS.filter((filter) => (
      filter === 'all' || filterMomentsByCategory(items, filter).length > 0
    )),
    [items],
  );
  useEffect(() => {
    if (!availableMomentsFilters.includes(momentsFilter)) setMomentsFilter('all');
  }, [availableMomentsFilters, momentsFilter]);
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
  const renderMomentCard = (i: Item, index: number) => (
    <MomentCard
      key={i.id}
      id={i.id}
      slug={i.slug}
      name={i.name}
      summary={i.summary}
      description={i.description}
      rating={i.rating}
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
      availableFilters={availableMomentsFilters}
      filters={momentsFilters}
    />
  );

  return (
    <div>
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
              clearLabel={momentsFilter !== 'all' ? (ui?.resetAll || 'Reset all') : t.moments?.clearSearch}
              onClear={(momentsSearch || momentsFilter !== 'all') ? () => {
                setMomentsSearch('');
                setMomentsFilter('all');
              } : undefined}
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
              clearLabel={momentsFilter !== 'all' ? (ui?.resetAll || 'Reset all') : t.moments?.clearSearch}
              onClear={(momentsSearch || momentsFilter !== 'all') ? () => {
                setMomentsSearch('');
                setMomentsFilter('all');
              } : undefined}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
export default memo(CategoryGridClientComponent);
