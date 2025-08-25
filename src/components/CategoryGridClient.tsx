"use client";
import { useState, useMemo, useEffect } from 'react';
import { TagFilters } from '@/components/TagFilters';
import ListingCard from '@/components/ListingCard';
import FilterDrawer from '@/components/FilterDrawer';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';

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
  categorySlug: string;
}

interface Props {
  items: Item[];
  locale: string;
  emptyLabel: string;
  categorySlug: string;
  ui?: { filters: string; map: string; list: string; resetAll: string; activeTags: string; none: string; };
}

export default function CategoryGridClient({ items, locale, emptyLabel, categorySlug, ui }: Props) {
  const [active, setActive] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const renderGroup = (group: Item[]) => {
    if (group.length === 0) return null;
    return (
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] mb-8">
        {group.map(i => (
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
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <TagFilters items={items.map(i => ({ tags: i.tags }))} active={active} onChange={setActive} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFiltersOpen(true)} className="px-3 py-2 rounded-full bg-white dark:bg-teal-800 border border-teal-200 dark:border-teal-700 shadow-sm text-xs font-medium">{ui?.filters || 'Filters'}</button>
          <button onClick={() => setShowMap(m => !m)} className="px-3 py-2 rounded-full bg-white dark:bg-teal-800 border border-teal-200 dark:border-teal-700 shadow-sm text-xs font-medium">{showMap ? (ui?.list || 'List') : (ui?.map || 'Map')}</button>
        </div>
      </div>
      {showMap && (
        <div className="mb-6 h-64 rounded-lg border border-teal-200 dark:border-teal-700 flex items-center justify-center text-xs text-teal-700 dark:text-teal-300 bg-white/60 dark:bg-teal-900/40">Map placeholder (integrate real map later)</div>
      )}
      {/* Skeleton while no items loaded (initial mount) */}
      {items.length === 0 && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] mb-8">
          {Array.from({length:6}).map((_,i)=><ListingCardSkeleton key={i}/>)}
        </div>
      )}
      {featured.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold tracking-wide uppercase mb-2 opacity-70">Featured</h2>
          {renderGroup(featured)}
        </section>
      )}
      {renderGroup(rest)}
      {filtered.length === 0 && (
        <div className="text-xs text-gray-600 px-2">{emptyLabel}</div>
      )}
  <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={ui?.filters || 'Filters'}>
        <div className="space-y-4">
          <div>
    <h3 className="text-xs font-semibold uppercase mb-1 opacity-70">{ui?.activeTags || 'Active Tags'}</h3>
    {active.length === 0 && <div className="text-xs opacity-50">{ui?.none || 'None'}</div>}
            {active.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {active.map(t => (
                  <li key={t} className="px-2 py-1 bg-teal-100 dark:bg-teal-800 rounded-full text-xs flex items-center gap-1">{t}<button aria-label={`Remove ${t}`} onClick={() => setActive(prev => prev.filter(x => x !== t))}>✕</button></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase mb-1 opacity-70">Stub Controls</h3>
            <p className="text-xs opacity-60">Add price range, rating slider, open now, etc.</p>
          </div>
          <div>
    <button onClick={() => { setActive([]); }} className="text-xs underline">{ui?.resetAll || 'Reset All'}</button>
          </div>
        </div>
      </FilterDrawer>
    </div>
  );
}
