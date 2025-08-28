"use client";
import Link from "next/link";

export default function OfflineActions({ homeHref, retryLabel = "Retry", homeLabel = "Home" }: { homeHref: string; retryLabel?: string; homeLabel?: string }) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => window.location.reload()}
  className="btn-primary text-sm"
      >
        {retryLabel}
      </button>
      <Link
        href={homeHref}
  className="btn-outline text-sm"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
