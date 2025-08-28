export function ListingCardSkeleton() {
  return (
    <div className="listing-card">
      <div className="w-full aspect-[3/2] skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 skeleton rounded" />
        <div className="h-3 w-1/2 skeleton rounded" />
        <div className="h-3 w-1/3 skeleton rounded" />
      </div>
    </div>
  );
}
