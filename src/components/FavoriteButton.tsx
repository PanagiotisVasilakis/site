"use client";
import { useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function FavoriteButton({ id, label, className, locale = 'en' }: { id: string; label: string; className?: string; locale?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const { push } = useToast();
  const t = getDictionary(locale as Locale);
  const active = isFavorite(id);
  const baseClass = "btn-primary";
  const finalClass = className ? `${baseClass} ${className}` : baseClass;
  const ariaLabel = (active
    ? (t.a11y?.removeNamedFavorite ?? 'Remove {label} from favorites')
    : (t.a11y?.addNamedFavorite ?? 'Add {label} to favorites')
  ).replace('{label}', label);

  return (
    <button
      type="button"
      onClick={() => { const before = isFavorite(id); toggle(id); if (!before) push(t.labels?.addedFavorite ?? 'Added to favorites'); else push(t.labels?.removedFavorite ?? 'Removed from favorites'); }}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`${finalClass} ${active ? 'bg-brand-700' : ''}`}
    >
      <span aria-hidden>{active ? '❤️' : '🤍'}</span>
      <span className="inline">{active ? (t.labels?.saved ?? 'Saved') : (t.labels?.save ?? 'Save')}</span>
    </button>
  );
}
