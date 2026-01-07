"use client";
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';

export default function FavoriteButton({ id, label, className }: { id: string; label: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const active = isFavorite(id);
  const baseClass = "btn-primary";
  const finalClass = className ? `${baseClass} ${className}` : baseClass;

  return (
    <button
      type="button"
      onClick={() => { const before = isFavorite(id); toggle(id); if (!before) push('Added to favorites'); else push('Removed from favorites'); }}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      className={`${finalClass} ${active ? 'bg-brand-700' : ''}`}
    >
      <span aria-hidden>{active ? '❤️' : '🤍'}</span>
      <span className="inline">{active ? 'Saved' : 'Save'}</span>
    </button>
  );
}
