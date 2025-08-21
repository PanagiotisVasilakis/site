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
    <Link href={href} className="inline-flex items-center gap-2 text-teal-800 border border-teal-200 rounded px-2 py-1 bg-white/80 hover:bg-white">
      {isEL ? "EN" : "EL"}
    </Link>
  );
}
