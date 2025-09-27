"use client";

export function BookingFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-6 bg-[color:var(--layer-bg-subtle)] rounded mb-4 w-1/3"></div>
        <div className="bg-[color:var(--layer-bg-subtle)] rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <div className="h-4 bg-[color:var(--layer-surface-alt)] rounded w-16"></div>
            <div className="h-4 bg-[color:var(--layer-surface-alt)] rounded w-24"></div>
          </div>
          <div className="flex justify-between">
            <div className="h-4 bg-[color:var(--layer-surface-alt)] rounded w-12"></div>
            <div className="h-4 bg-[color:var(--layer-surface-alt)] rounded w-16"></div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="h-4 bg-[color:var(--layer-bg-subtle)] rounded mb-2 w-20"></div>
          <div className="h-12 bg-[color:var(--layer-bg-subtle)] rounded"></div>
        </div>
        <div>
          <div className="h-4 bg-[color:var(--layer-bg-subtle)] rounded mb-2 w-20"></div>
          <div className="h-12 bg-[color:var(--layer-bg-subtle)] rounded"></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-16"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-20"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>

      <div>
        <div className="h-4 bg-[color:var(--layer-bg-subtle)] rounded mb-2 w-32"></div>
        <div className="h-12 bg-[color:var(--layer-bg-subtle)] rounded"></div>
      </div>

      <div>
        <div className="h-4 bg-[color:var(--layer-bg-subtle)] rounded mb-2 w-28"></div>
        <div className="h-20 bg-[color:var(--layer-bg-subtle)] rounded"></div>
      </div>

      <div className="h-12 bg-[color:var(--layer-bg-subtle)] rounded"></div>
    </div>
  );
}
