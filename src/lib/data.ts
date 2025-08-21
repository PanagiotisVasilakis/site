import fs from "node:fs";
import path from "node:path";
import { ItemSchema, type Item } from "@/data/schemas";
import { categories } from "@/data/categories";
import type { Locale } from "@/i18n/config";

const dataRoot = path.join(process.cwd(), "src", "data", "items");

export type CategoryWithCount = (typeof categories)[number] & { count: number };

export function getCategoriesWithCounts(): CategoryWithCount[] {
  return categories.map((c) => ({ ...c, count: getItemsByCategory(c.id).length }));
}

export function getItemsByCategory(categoryId: string): Item[] {
  const file = path.join(dataRoot, `${categoryId}.json`);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed
    .map((i) => {
      if (!i || typeof i !== "object") return null;
      const obj = i as Record<string, unknown>;
      const name = typeof obj["name"] === "string" ? (obj["name"] as string) : "";
      return ItemSchema.parse({ ...(obj as object), slug: toSlug(name) });
    })
    .filter(Boolean) as Item[];
}

export function getItem(categoryId: string, slug: string): Item | null {
  const items = getItemsByCategory(categoryId);
  return items.find((i) => (i.slug ?? toSlug(i.name)) === slug) ?? null;
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function telHref(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^+0-9]/g, "");
  return `tel:${digits}`;
}

export function mapsHref(address?: string, lat?: number, lng?: number): string | undefined {
  if (!address && (lat == null || lng == null)) return undefined;
  if (lat != null && lng != null) return `https://maps.google.com/?q=${lat},${lng}`;
  return `https://maps.google.com/?q=${encodeURIComponent(address!)}`;
}

export function pickLocale<T extends Record<string, unknown>>(obj: T, baseKey: string, locale: Locale): string | undefined {
  const lk = `${baseKey}_${locale}`;
  const ek = `${baseKey}_en`;
  const lv = obj[lk];
  const bv = obj[baseKey];
  const ev = obj[ek];
  return (typeof lv === "string" && lv) || (typeof bv === "string" && bv) || (typeof ev === "string" && ev) || undefined;
}

// Narrow helpers for known shapes to avoid any-casts at call sites
export const pickItemLocale = (item: import("@/data/schemas").Item, key: "name" | "summary" | "address", locale: Locale) =>
  pickLocale(item as Record<string, unknown>, key, locale);

export const pickCategoryLocale = (
  cat: import("@/data/schemas").Category,
  key: "title" | "description",
  locale: Locale
) => pickLocale(cat as Record<string, unknown>, key, locale);
