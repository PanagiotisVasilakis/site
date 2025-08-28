"use client";
import { useFavorites } from '@/lib/favorites';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
const ListingCard = dynamic(() => import('@/components/ListingCard'), { ssr: false });

interface FavItem {
  id: string;
  title: string;
  subtitle?: string;
  rating?: number;
  price?: string;
  icon?: string;
  href: string;
  favoriteId: string;
}

interface Props {
  allItems: FavItem[];
  emptyLabel: string;
  titleLabel: string;
  locale: string;
}

export default function FavoritesClient({ allItems, emptyLabel, titleLabel }: Props) {
  const { favorites } = useFavorites();
  const list = useMemo(() => allItems.filter(i => favorites.has(i.favoriteId)), [allItems, favorites]);
  return (
    <section>
      <header className="mb-4 flex items-end justify-between">
  <h1 className="text-2xl font-semibold text-brand-800">{titleLabel}</h1>
        {list.length > 0 && <div className="text-xs opacity-60">{list.length}</div>}
      </header>
      {list.length === 0 && (
        <div className="text-sm text-gray-600">{emptyLabel}</div>
      )}
      {list.length > 0 && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {list.map(i => (
            <ListingCard key={i.favoriteId} id={i.id} title={i.title} subtitle={i.subtitle} rating={i.rating} price={i.price} icon={i.icon} href={i.href} favoriteId={i.favoriteId} />
          ))}
        </div>
      )}
    </section>
  );
}
