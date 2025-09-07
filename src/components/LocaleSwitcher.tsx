"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

function swapLocale(pathname: string, next: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return `/${next}`;
  if (parts[0] === "en" || parts[0] === "el") {
    parts[0] = next;
    return `/${parts.join("/")}`;
  }
  return `/${next}/${parts.join("/")}`;
}

export default function LocaleSwitcher() {
  const pathname = usePathname() || "/en";
  const isEL = pathname.startsWith("/el");
  const target = isEL ? "en" : "el";
  const href = swapLocale(pathname, target);
  return (
  <Link
      href={href}
  className="inline-flex items-center justify-center h-7 px-3 rounded-full text-[11px] font-semibold tracking-wide bg-black/10 hover:bg-black/20 text-slate-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/70 dark:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 dark:focus-visible:ring-brand-400/50"
    >
      {isEL ? "EN" : "EL"}
    </Link>
  );
}
