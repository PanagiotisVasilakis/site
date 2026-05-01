"use client";
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { TagFilters } from '@/components/TagFilters';
import ListingCard from '@/components/ListingCard';
import FilterDrawer from '@/components/FilterDrawer';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';
import dynamic from 'next/dynamic';
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { EmptyState, MomentCard, MomentsToolbar } from '@/components/moments';
import { filterMomentsByCategory, type MomentsFilterKey } from '@/components/moments/MomentsFilterMenu';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';
import GuideOptionCard from '@/components/GuideOptionCard';

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
  momentsFilters?: { all: string; beaches: string; museums: string; restaurants: string; bars: string; brunchs: string; taygetos: string; sites: string; nearby: string; };
}

function PhoneOptionIcon({ id }: { id: string }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
  };

  if (id === 'police') {
    return (
      <svg {...common} aria-hidden>
        <path d="M12 3l7 3v5.5c0 4.4-2.8 7.5-7 9.5-4.2-2-7-5.1-7-9.5V6l7-3z" />
        <path d="M9.2 12.1l1.9 1.9 3.9-4.2" />
      </svg>
    );
  }

  if (id === 'ambulance') {
    return (
      <svg {...common} aria-hidden>
        <path d="M3 8h10v8H3z" />
        <path d="M13 10h3.2l2.8 3v3h-6z" />
        <path d="M6.5 18.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
        <path d="M16.8 18.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
        <path d="M8 6v5" />
        <path d="M5.5 8.5h5" />
      </svg>
    );
  }

  if (id === 'taxi') {
    return (
      <svg {...common} aria-hidden>
        <path d="M6 16h12" />
        <path d="M5 12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12" />
        <path d="M4 12h16v5H4z" />
        <path d="M7 17.5v1" />
        <path d="M17 17.5v1" />
        <path d="M9.5 4.5h5" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

function CategoryGridClientComponent({ items, locale, emptyLabel, categorySlug, ui, phonesLayout, momentsLayout, momentsFilters }: Props) {
  const [active, setActive] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [momentsFilter, setMomentsFilter] = useState<MomentsFilterKey>('all');
  const [momentsSearch, setMomentsSearch] = useState('');
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  // URL persistence
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tags = params.get('tags');
    const map = params.get('map');
    if (tags) setActive(tags.split(',').filter(Boolean));
    if (map === '1') setShowMap(true);
  }, []);
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
            favLabelAdd="Add to favorites"
            favLabelRemove="Remove favorite"
          />
        ))}
        {progressive && slice.length < group.length && (
          <div ref={loadMoreRef} className="col-span-full flex justify-center py-4 text-xs opacity-60 loading-sentinel">Loading more…</div>
        )}
      </div>
    );
  }, [visibleCount, locale, categorySlug]);
  return (
    <div>
      {!momentsLayout && (
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
          <TagFilters items={items.map(i => ({ tags: i.tags }))} active={active} onChange={setActive} />
        </div>
      )}

      {/* Phones layout: responsive grid that wraps to next row when needed */}
      {categorySlug === 'phones' && phonesLayout && !showMap ? (
        <div className="max-w-5xl mx-auto px-4 mb-6">
          <div className="guide-option-grid mx-auto">
            {items.map(i => {
              const fid = `${categorySlug}:${i.id}`;
              const wish = isFavorite(fid);
              const toggleLocal = () => { const before = isFavorite(fid); toggle(fid); if (!before) push('Added to favorites'); else push('Removed from favorites'); };
              return (
                <GuideOptionCard
                  key={i.id}
                  href={`/${locale}/${categorySlug}/${i.slug}`}
                  title={i.name}
                  summary={i.summary}
                  icon={<PhoneOptionIcon id={i.id} />}
                  minHeightClass="min-h-[200px]"
                  action={
                    <button type="button" aria-label={wish ? 'Remove favorite' : 'Add to favorites'} className="wishlist-btn" onClick={toggleLocal}>
                      <span aria-hidden>{wish ? '❤️' : '🤍'}</span>
                    </button>
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}
      {/* Moments layout */}
      {categorySlug === 'moments' && momentsLayout && !showMap ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          <MomentsToolbar
            search={momentsSearch}
            onSearchChange={setMomentsSearch}
            activeFilter={momentsFilter}
            onFilterChange={setMomentsFilter}
            showMap={showMap}
            onMapToggle={() => setShowMap(m => !m)}
            mapLabel={ui?.map || 'Map'}
            listLabel={ui?.list || 'List'}
            filters={momentsFilters}
          />
          <div className={momentsLayoutConfig.grid.gridClass}>
            {momentsFiltered.map((i, index) => (
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
                categorySlug={categorySlug}
                locale={locale}
              />
            ))}
          </div>
          {momentsFiltered.length === 0 && (
            <EmptyState
              message="No places found. Try another category or clear your search."
              onClear={momentsSearch ? () => setMomentsSearch('') : undefined}
            />
          )}
        </div>
      ) : null}
      {categorySlug === 'moments' && momentsLayout && showMap ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          <MomentsToolbar
            search={momentsSearch}
            onSearchChange={setMomentsSearch}
            activeFilter={momentsFilter}
            onFilterChange={setMomentsFilter}
            showMap={showMap}
            onMapToggle={() => setShowMap(m => !m)}
            mapLabel={ui?.map || 'Map'}
            listLabel={ui?.list || 'List'}
            filters={momentsFilters}
          />
          <div className="moments-map-panel">
            <ApartmentLocationMap
              locale={locale}
              height="420px"
              zoom={13}
              showNearbyAttractions={true}
              className="moments-map-frame"
              nearbyRestaurants={momentsFiltered}
            />
            <p className="moments-map-caption">
              Apartment location and nearby {categorySlug}. Zoom and click markers for details.
            </p>
          </div>
          {momentsFiltered.length === 0 && (
            <EmptyState
              message="No places found. Try another category or clear your search."
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
            showNearbyAttractions={true}
            className="rounded-lg overflow-hidden shadow-sm"
            nearbyRestaurants={categorySlug === 'moments' ? items : []}
            nearbyServices={categorySlug === 'phones' ? items : []}
            nearbyAttractions={categorySlug === 'sightseeing' ? items : []}
          />
          <div className="mt-3 text-center">
            <p className="text-sm text-subtle">
              🏡 Apartment location and nearby {categorySlug} • Zoom and click markers for details
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
              <h2 className="text-sm font-serif italic font-bold mb-2 text-small-strong">Featured</h2>
              {renderGroup(featured)}
            </section>
          )}
          {renderGroup(rest, true)}
          {filtered.length === 0 && (
            <div className="text-xs text-subtle px-2">{emptyLabel}</div>
          )}
          <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={ui?.filters || 'Filters'}>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-serif italic font-bold mb-1 text-small-strong">{ui?.activeTags || 'Active Tags'}</h3>
                {active.length === 0 && <div className="text-xs opacity-50">{ui?.none || 'None'}</div>}
                {active.length > 0 && (
                  <ul className="flex flex-wrap gap-1">
                    {active.map(t => (
                      <li key={t} className="tag-filter is-on flex items-center gap-1">{t}<button aria-label={`Remove ${t}`} onClick={() => setActive(prev => prev.filter(x => x !== t))}>✕</button></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-serif italic font-bold mb-1 text-small-strong">Stub Controls</h3>
                <p className="text-xs text-small-strong" style={{ fontWeight: 400 }}>Add price range, rating slider, open now, etc.</p>
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
