"use client";
import { useState } from 'react';

interface CategoryChip {
  id: string;
  title: string;
  icon?: string;
  slug: string;
}

interface Props {
  categories: CategoryChip[];
  active?: string | null;
  onChange?: (id: string | null) => void;
}

export default function CategoryChips({ categories, active: controlled, onChange }: Props) {
  const [uncontrolled, setUncontrolled] = useState<string | null>(null);
  const active = controlled !== undefined ? controlled : uncontrolled;
  function setActive(id: string | null) {
    if (controlled !== undefined) onChange?.(id); else { setUncontrolled(id); onChange?.(id); }
  }
  return (
    <div className="h-scroll -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Categories">
      {categories.map(c => (
        <button
          key={c.id}
          type="button"
          data-active={active === c.id || undefined}
          className="chip-cat"
          onClick={() => setActive(active === c.id ? null : c.id)}
        >
          <span aria-hidden>{c.icon || '📍'}</span>
          <span className="truncate max-w-[8rem]">{c.title}</span>
        </button>
      ))}
    </div>
  );
}
