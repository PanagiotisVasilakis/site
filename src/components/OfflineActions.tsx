"use client";
import Link from "next/link";

export default function OfflineActions({ homeHref, retryLabel = "Retry", homeLabel = "Home" }: { homeHref: string; retryLabel?: string; homeLabel?: string }) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded bg-teal-600 text-white text-sm font-medium shadow hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
      >
        {retryLabel}
      </button>
      <Link
        href={homeHref}
        className="px-4 py-2 rounded border border-teal-300 text-teal-800 bg-white/80 backdrop-blur text-sm font-medium shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
