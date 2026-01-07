"use client";
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { TagFilters } from '@/components/TagFilters';
import ListingCard from '@/components/ListingCard';
import FilterDrawer from '@/components/FilterDrawer';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';
import dynamic from 'next/dynamic';
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { MomentsListCard } from '@/components/moments';
import { momentsLayoutConfig } from '@/config/momentsLayoutConfig';

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
}

function CategoryGridClientComponent({ items, locale, emptyLabel, categorySlug, ui, phonesLayout, momentsLayout }: Props) {
  const [active, setActive] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {!(phonesLayout || momentsLayout) && (
            <button onClick={() => setFiltersOpen(true)} className="btn-tint btn-sm">{ui?.filters || 'Filters'}</button>
          )}
          <button onClick={() => setShowMap(m => !m)} className="btn-tint btn-sm">{showMap ? (ui?.list || 'List') : (ui?.map || 'Map')}</button>
        </div>
      </div>

      {!(phonesLayout || momentsLayout) && (
        <div className="mb-3">
          <TagFilters items={items.map(i => ({ tags: i.tags }))} active={active} onChange={setActive} />
        </div>
      )}

      {/* Phones layout: responsive grid that wraps to next row when needed */}
      {categorySlug === 'phones' && phonesLayout && !showMap ? (
        <div className="max-w-5xl mx-auto px-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mx-auto">
            {items.map(i => {
              const fid = `${categorySlug}:${i.id}`;
              const wish = isFavorite(fid);
              const toggleLocal = () => { const before = isFavorite(fid); toggle(fid); if (!before) push('Added to favorites'); else push('Removed from favorites'); };
              return (
                <div key={i.id} className="relative">
                  <a href={`/${locale}/${categorySlug}/${i.slug}`} className="card p-6 flex flex-col items-center text-center transition-all group hover:shadow-lg">
                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform" aria-hidden>{i.icon || '📋'}</div>
                    <div className="text-lg font-medium mb-2">{i.name}</div>
                    {i.summary && <p className="text-sm opacity-80">{i.summary}</p>}
                  </a>
                  <button type="button" aria-label={wish ? 'Remove favorite' : 'Add to favorites'} className="wishlist-btn" onClick={toggleLocal}>
                    <span aria-hidden>{wish ? '❤️' : '🤍'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {/* Moments layout: using centralized MomentsListCard component */}
      {categorySlug === 'moments' && momentsLayout && !showMap ? (
        <div className={momentsLayoutConfig.grid.containerClass}>
          <div className={momentsLayoutConfig.grid.gridClass}>
            {items.map(i => (
              <MomentsListCard
                key={i.id}
                id={i.id}
                slug={i.slug}
                name={i.name}
                summary={i.summary}
                rating={i.rating}
                price={i.price}
                icon={i.icon}
                image={i.image}
                categorySlug={categorySlug}
                locale={locale}
              />
            ))}
          </div>
        </div>
      ) : null}
      {showMap && (
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
              <h2 className="text-sm font-serif italic font-bold tracking-wide mb-2 text-small-strong">Featured</h2>
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
