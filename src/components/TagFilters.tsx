"use client";
import { useState, useMemo } from 'react';

interface Props {
  items: Array<{ tags?: string[] }>;
  active?: string[];
  onChange?: (tags: string[]) => void;
}

export function TagFilters({ items, active: controlledActive, onChange }: Props) {
  const all = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [items]);
  const [uncontrolled, setUncontrolled] = useState<string[]>([]);
  const active = controlledActive ?? uncontrolled;
  const setActive = (val: (prev: string[]) => string[]) => {
    if (controlledActive != null && onChange) {
      onChange(val(active));
    } else {
      setUncontrolled(val(active));
      onChange?.(val(active));
    }
  };
  const toggle = (tag: string) => {
    setActive(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const clearAll = () => {
    setActive(() => []);
  };
  if (all.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {active.length > 0 && (
        <button
          key="__reset"
          onClick={clearAll}
          className="tag-filter reset-chip"
          aria-label="Reset filters"
        >Reset filters</button>
      )}
      {all.map(tag => {
        const on = active.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            className={`tag-filter ${on ? 'is-on' : ''}`}
          >{tag}</button>
        );
      })}
    </div>
  );
}
