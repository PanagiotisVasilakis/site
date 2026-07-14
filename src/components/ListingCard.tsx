"use client";
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import Image from 'next/image';
import { memo, useCallback, useMemo } from 'react';

interface ListingCardProps {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  rating?: number;
  href?: string;
  icon?: string;
  footer?: string;
  favoriteId?: string;
  favLabelAdd?: string;
  favLabelRemove?: string;
  addedToast?: string;
  removedToast?: string;
}

function ListingCardComponent({ id, title, subtitle, image, rating, href = '#', icon, footer, favoriteId, favLabelAdd = 'Add to favorites', favLabelRemove = 'Remove from favorites', addedToast = 'Added to favorites', removedToast = 'Removed from favorites' }: ListingCardProps) {
  const fid = favoriteId || id;
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const wish = isFavorite(fid);
  const toggleLocal = useCallback(() => { const before = isFavorite(fid); toggle(fid); if (!before) push(addedToast); else push(removedToast); }, [fid, isFavorite, toggle, push, addedToast, removedToast]);
  const aria = useMemo(() => ({
    labelledby: `title-${id}`,
    describedby: `desc-${id}`
  }), [id]);
  return (
    <article className="listing-card group h-full flex flex-col relative" data-id={id}>
      <a href={href} className="h-full flex flex-col" aria-labelledby={aria.labelledby} aria-describedby={aria.describedby}>
      <div className="relative">
        {image ? (
          <Image src={image} alt="" width={600} height={400} className="w-full h-auto" />
        ) : (
          <div className="w-full aspect-[3/2] flex items-center justify-center text-4xl select-none">
            <span aria-hidden>{icon || '📍'}</span>
          </div>
        )}
      </div>
  <div className="listing-info mt-auto text-center">
        <div className="flex items-start justify-center gap-3">
          <h3 id={`title-${id}`} className="font-medium text-[0.84rem] leading-snug line-clamp-2 flex-1">{title}</h3>
          {rating && (
            <div className="text-[0.7rem] font-semibold flex items-center gap-1">
              <span aria-hidden>⭐</span>{rating.toFixed(1)}
            </div>
          )}
        </div>
  {subtitle && <p id={`desc-${id}`} className="text-[0.68rem] text-small-strong line-clamp-2" style={{fontWeight:500}}>{subtitle}</p>}
        <div className="mt-1 text-[0.7rem] font-medium opacity-80 flex items-center gap-2">
          {footer && <span className="ml-auto truncate max-w-[8rem] opacity-60">{footer}</span>}
        </div>
      </div>
      </a>
      <button type="button" aria-label={wish ? favLabelRemove : favLabelAdd} className="wishlist-btn" onClick={toggleLocal}>
        <span aria-hidden>{wish ? '❤️' : '🤍'}</span>
      </button>
    </article>
  );
}
export default memo(ListingCardComponent);
