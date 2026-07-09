export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-[color:var(--layer-surface-alt)] ${className}`}
    />
  );
}
