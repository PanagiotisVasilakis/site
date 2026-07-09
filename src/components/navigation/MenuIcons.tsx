import clsx from 'clsx';

export type MenuIconName =
  | 'gallery'
  | 'calendar'
  | 'booking'
  | 'about'
  | 'favorite'
  | 'moments'
  | 'phone'
  | 'checkin'
  | 'user';

export function MenuIcon({ name }: { name: MenuIconName }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'gallery':
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4.5 3.2 3.2 2.3-2.3 4 3.6" /></svg>;
    case 'calendar':
      return <svg {...commonProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m8.5 15 2 2 5-5" /></svg>;
    case 'booking':
      return <svg {...commonProps}><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6M9 12h6" /></svg>;
    case 'about':
      return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>;
    case 'favorite':
      return <svg {...commonProps}><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" /></svg>;
    case 'moments':
      return <svg {...commonProps}><path d="M7 3v7a3 3 0 0 1-3 3V3M7 3v18M17 3v18M17 3c2.2 2.1 3 4.3 3 6.5S18.7 13 17 13" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case 'phone':
      return <svg {...commonProps}><path d="M7.2 3.5 10 7.8 7.9 10a16.2 16.2 0 0 0 6.1 6.1l2.2-2.1 4.3 2.8-.8 3a2 2 0 0 1-2 1.5C9.4 20.5 3.5 14.6 2.7 6.3a2 2 0 0 1 1.5-2l3-.8Z" /></svg>;
    case 'checkin':
      return <svg {...commonProps}><path d="M4 12.5 9 17l11-11" /></svg>;
    case 'user':
      return <svg {...commonProps}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  }
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="m7.5 4.5 5 5.5-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className="menu-trigger-glyph" aria-hidden>
      <span className={clsx("menu-trigger-line", open && "is-open")} />
      <span className={clsx("menu-trigger-line", open && "is-open")} />
    </span>
  );
}
