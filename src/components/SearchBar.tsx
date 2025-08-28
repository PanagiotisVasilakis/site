"use client";
import { useState } from "react";

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
  function update<K extends keyof SearchState>(key: K, value: SearchState[K]) {
    setState(s => ({ ...s, [key]: value }));
  }
  function submit() {
    onSearch?.(state);
  }
  return (
    <div className="search-bar" role="search" aria-label="Search destination">
      <button type="button" className="search-seg text-left" onClick={() => { /* future: open location picker */ }}>
        <span className="search-label">{labels?.where || 'Where'}</span>
        <span className="search-value">{state.location || labels?.addLocation || 'Add location'}</span>
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
