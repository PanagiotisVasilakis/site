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
  <Link href={href} className="btn-outline btn-sm">
      {isEL ? "EN" : "EL"}
    </Link>
  );
}
