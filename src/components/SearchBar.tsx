"use client";
import { useState, useRef, useEffect } from "react";

interface SearchState {
  location: string;
  dates: string; // simplified; production would use date range
  guests: number;
}

interface Props {
  onSearch?: (state: SearchState) => void;
  initial?: Partial<SearchState>;
  labels?: {
    where: string; addLocation: string; dates: string; addDates: string; guestsLabel: string; guestSingular: string; guestPlural: string; search: string;
  };
}

export default function SearchBar({ onSearch, initial, labels }: Props) {
  const [state, setState] = useState<SearchState>({
    location: initial?.location || "",
    dates: initial?.dates || "",
    guests: initial?.guests || 1,
  });
  const shortcut = '/';
  const firstSegRef = useRef<HTMLButtonElement | null>(null);
  // Global shortcut listener to focus search (location segment)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Ignore if typing inside editable/inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        firstSegRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Future: global key listener to focus search when pressing '/'
  function update<K extends keyof SearchState>(key: K, value: SearchState[K]) {
    setState(s => ({ ...s, [key]: value }));
  }
  function submit() {
    onSearch?.(state);
  }
  return (
    <div className="search-bar" role="search" aria-label={labels?.search || 'Search'}>
  <button ref={firstSegRef} type="button" className="search-seg text-left" onClick={() => { /* future: open location picker */ }}>
        <span className="search-label">{labels?.where || 'Where'}</span>
        <span className="search-value flex items-center gap-1">
          {state.location || labels?.addLocation || 'Add location'}
          {!state.location && <kbd className="text-[10px] font-normal opacity-60 border border-soft px-1 py-0.5 rounded">{shortcut}</kbd>}
        </span>
      </button>
      <button type="button" className="search-seg text-left hidden sm:flex" onClick={() => { /* future: open date picker */ }}>
        <span className="search-label">{labels?.dates || 'Dates'}</span>
        <span className="search-value">{state.dates || labels?.addDates || 'Add dates'}</span>
      </button>
      <div className="search-seg text-left min-w-[110px]">
        <span className="search-label">{labels?.guestsLabel || 'Guests'}</span>
        <span className="search-value flex items-center gap-1">
          <input
            aria-label="Guests"
            type="number"
            min={1}
            value={state.guests}
            onChange={e => update('guests', Math.max(1, Number(e.target.value) || 1))}
            className="bg-transparent w-14 focus:outline-none" />
          <span className="opacity-70">{state.guests === 1 ? (labels?.guestSingular || 'guest') : (labels?.guestPlural || 'guests')}</span>
        </span>
      </div>
      <div className="search-action">
        <button type="button" onClick={submit} className="search-go">
            <span className="hidden sm:inline search-go-text">{labels?.search || 'Search'}</span>
          <span aria-hidden>🔍</span>
        </button>
      </div>
    </div>
  );
}
