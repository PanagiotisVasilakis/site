"use client";
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';

export default function FavoriteButton({ id, label }: { id: string; label: string }) {
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const active = isFavorite(id);
  return (
    <button
      type="button"
      onClick={() => { const before = isFavorite(id); toggle(id); if (!before) push('Added to favorites'); else push('Removed from favorites'); }}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      className={`fav-btn ${active ? 'is-active' : ''}`}
    >
      <span aria-hidden>{active ? '★' : '☆'}</span>
      <span className="hidden sm:inline">{active ? 'Saved' : 'Save'}</span>
    </button>
  );
}
