export function ListingCardSkeleton() {
  return (
    <div className="listing-card animate-pulse">
      <div className="w-full aspect-[3/2] bg-slate-200 dark:bg-teal-800/40" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 bg-slate-200 dark:bg-teal-700/40 rounded" />
        <div className="h-3 w-1/2 bg-slate-200 dark:bg-teal-700/40 rounded" />
        <div className="h-3 w-1/3 bg-slate-200 dark:bg-teal-700/40 rounded" />
      </div>
    </div>
  );
}
