"use client";
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import Image from 'next/image';

interface ListingCardProps {
  id: string;
  title: string;
  subtitle?: string;
  image?: string; // placeholder now
  rating?: number;
  price?: string; // generic label (e.g., price category or phone)
  href?: string;
  icon?: string;
  footer?: string;
  favoriteId?: string;
  favLabelAdd?: string;
  favLabelRemove?: string;
}

export default function ListingCard({ id, title, subtitle, image, rating, price, href = '#', icon, footer, favoriteId, favLabelAdd = 'Add to favorites', favLabelRemove = 'Remove from favorites' }: ListingCardProps) {
  const fid = favoriteId || id;
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const wish = isFavorite(fid);
  const toggleLocal = () => { const before = isFavorite(fid); toggle(fid); if (!before) push('Added to favorites'); else push('Removed from favorites'); };
  return (
    <a href={href} className="listing-card group" data-id={id}>
      <div className="relative">
        {image ? (
          <Image src={image} alt="" width={600} height={400} className="w-full h-auto" />
        ) : (
          <div className="w-full aspect-[3/2] flex items-center justify-center text-4xl select-none">
            <span aria-hidden>{icon || '📍'}</span>
          </div>
        )}
        <button type="button" aria-label={wish ? favLabelRemove : favLabelAdd} className="wishlist-btn" onClick={e => { e.preventDefault(); toggleLocal(); }}>
          <span aria-hidden>{wish ? '❤️' : '🤍'}</span>
        </button>
      </div>
      <div className="listing-info">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium text-[0.84rem] leading-snug line-clamp-2 flex-1">{title}</h3>
          {rating && (
            <div className="text-[0.7rem] font-semibold flex items-center gap-1">
              <span aria-hidden>⭐</span>{rating.toFixed(1)}
            </div>
          )}
        </div>
  {subtitle && <p className="text-[0.68rem] text-small-strong line-clamp-2" style={{fontWeight:500}}>{subtitle}</p>}
        <div className="mt-1 text-[0.7rem] font-medium opacity-80 flex items-center gap-2">
          {price && <span>{price}</span>}
          {footer && <span className="ml-auto truncate max-w-[8rem] opacity-60">{footer}</span>}
        </div>
      </div>
    </a>
  );
}
