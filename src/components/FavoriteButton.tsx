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
      className={`flex items-center gap-1 rounded px-3 py-2 text-sm border transition-colors ${active ? 'bg-teal-600 text-white border-teal-600' : 'border-teal-300 text-teal-800 bg-white/70 hover:bg-white'}`}
    >
      <span>{active ? '★' : '☆'}</span>
      <span className="hidden sm:inline">{active ? 'Saved' : 'Save'}</span>
    </button>
  );
}
