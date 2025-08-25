"use client";
import Link from 'next/link';
import { useState, useMemo } from 'react';
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

  return (
    <>
      <TagFilters items={items} onChange={setActive} active={active} />
      {[featured, rest].map((list, idx) => (
        <section className="space-y-2 mb-6" key={idx}>
          {list.map(i => (
            <Link
              key={i.id}
              href={`/${locale}/${categorySlug}/${i.slug ?? i.id}`}
              className="block card p-4 hover:bg-white/90 min-h-[72px]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-teal-900">{i.name}</div>
                  {i.summary && <div className="text-xs text-gray-600">{i.summary}</div>}
                </div>
                <div className="text-sm text-teal-700">{tDetails}</div>
              </div>
            </Link>
          ))}
          {list.length === 0 && idx === 1 && filtered.length === 0 && (
            <div className="text-xs text-gray-600 px-2">No matches</div>
          )}
        </section>
      ))}
    </>
  );
}
