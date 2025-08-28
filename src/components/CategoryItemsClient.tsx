"use client";
import Link from 'next/link';
import { useState, useMemo, useEffect, useRef } from 'react';
import { TagFilters } from './TagFilters';

type Item = {
  id: string;
  slug?: string;
  name: string;
  summary?: string;
  tags?: string[];
  featured?: boolean;
};

interface Props {
  items: Item[];
  locale: string;
  categorySlug: string;
  tDetails: string;
}

export default function CategoryItemsClient({ items, locale, categorySlug, tDetails }: Props) {
  const [active, setActive] = useState<string[]>([]);
  const all = useMemo(() => items, [items]);
  const filtered = useMemo(() => {
    if (active.length === 0) return all;
    return all.filter(i => i.tags?.some(t => active.includes(t)));
  }, [all, active]);

  const featured = filtered.filter(i => i.featured);
  const rest = filtered.filter(i => !i.featured);

  const [visibleFeatured, setVisibleFeatured] = useState(10);
  const [visibleRest, setVisibleRest] = useState(30);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setVisibleFeatured(10); setVisibleRest(30); }, [filtered]);
  useEffect(() => {
    const el = sentinelRef.current; if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e=>e.isIntersecting)) {
        setVisibleRest(v => Math.min(v + 30, rest.length));
      }
    }, { rootMargin: '600px 0px' });
    obs.observe(el); return () => obs.disconnect();
  }, [rest.length]);
  return (
    <>
      <TagFilters items={items} onChange={setActive} active={active} />
  {[featured.slice(0, visibleFeatured), rest.slice(0, visibleRest)].map((list, idx) => (
        <section className="space-y-2 mb-6" key={idx}>
          {list.map(i => (
            <Link
              key={i.id}
              href={`/${locale}/${categorySlug}/${i.slug ?? i.id}`}
              className="block card p-4 hover:bg-white/90 min-h-[72px]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{color:'var(--text-accent)'}}>{i.name}</div>
                  {i.summary && <div className="text-xs text-gray-600">{i.summary}</div>}
                </div>
                <div className="text-sm" style={{color:'var(--text-accent-subtle)'}}>{tDetails}</div>
              </div>
            </Link>
          ))}
          {list.length === 0 && idx === 1 && filtered.length === 0 && (
            <div className="text-xs text-gray-600 px-2">No matches</div>
          )}
          {idx === 1 && rest.length > list.length && (
            <div ref={sentinelRef} className="text-center text-[11px] opacity-60 py-2 loading-sentinel">Loading more…</div>
          )}
        </section>
      ))}
    </>
  );
}
