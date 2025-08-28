"use client";
import { useFavorites } from '@/lib/favorites';

export default function FavoriteButton({ id, label }: { id: string; label: string }) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(id);
  return (
    <button
      onClick={() => toggle(id)}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      className={`fav-btn ${active ? 'is-active' : ''}`}
    >
      <span>{active ? '★' : '☆'}</span>
      <span className="hidden sm:inline">{active ? 'Saved' : 'Save'}</span>
    </button>
  );
}
