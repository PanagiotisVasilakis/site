"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface LocaleSwitcherProps {
  fullText?: boolean;
  showGlobeIcon?: boolean;
}

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

function LocaleSwitcherContent({ fullText = false, showGlobeIcon = false }: LocaleSwitcherProps) {
  const pathname = usePathname() || "/en";
  const searchParams = useSearchParams();
  const isEL = pathname.startsWith("/el");
  const target = isEL ? "en" : "el";
  
  const href = swapLocale(pathname, target, searchParams);
  
  const displayText = fullText 
    ? (isEL ? "English" : "Ελληνικά")
    : (isEL ? "EN" : "EL");
  
  return (
    <Link
      href={href}
      className="locale-switcher inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70 dark:!text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 dark:focus-visible:ring-brand-400/50"
    >
      {showGlobeIcon && <span aria-hidden className="text-sm">🌐</span>}
      {displayText}
    </Link>
  );
}

export default function LocaleSwitcher({ fullText = false, showGlobeIcon = false }: LocaleSwitcherProps) {
  return (
    <Suspense fallback={
      <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-black/10 text-slate-800 dark:bg-zinc-800/60 dark:!text-white">
        {showGlobeIcon && <span aria-hidden className="text-sm">🌐</span>}
        --
      </div>
    }>
      <LocaleSwitcherContent fullText={fullText} showGlobeIcon={showGlobeIcon} />
    </Suspense>
  );
}
