"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function swapLocale(pathname: string, next: string, searchParams?: URLSearchParams | null) {
  const parts = pathname.split("/").filter(Boolean);
  let newPath;
  if (parts.length === 0) {
    newPath = `/${next}`;
  } else if (parts[0] === "en" || parts[0] === "el") {
    parts[0] = next;
    newPath = `/${parts.join("/")}`;
  } else {
    newPath = `/${next}/${parts.join("/")}`;
  }
  
  // Append search params if they exist
  if (searchParams && searchParams.toString()) {
    return `${newPath}?${searchParams.toString()}`;
  }
  return newPath;
}

function LocaleSwitcherContent() {
  const pathname = usePathname() || "/en";
  const searchParams = useSearchParams();
  const isEL = pathname.startsWith("/el");
  const target = isEL ? "en" : "el";
  
  const href = swapLocale(pathname, target, searchParams);
  
  return (
    <Link
      href={href}
  className="locale-switcher inline-flex items-center justify-center h-7 px-3 rounded-full text-[11px] font-semibold tracking-wide bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 dark:focus-visible:ring-brand-400/50"
    >
      {isEL ? "EN" : "EL"}
    </Link>
  );
}

export default function LocaleSwitcher() {
  return (
    <Suspense fallback={
      <div className="inline-flex items-center justify-center h-7 px-3 rounded-full text-[11px] font-semibold tracking-wide bg-black/10 text-slate-800 dark:bg-zinc-800/60 dark:text-white">
        --
      </div>
    }>
      <LocaleSwitcherContent />
    </Suspense>
  );
}
