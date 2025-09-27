import fs from "node:fs";
import path from "node:path";
import { ItemSchema, type Item } from "../data/schemas";
import { categories } from "../data/categories";
import type { Locale } from "@/i18n/config";
import { logger } from '@/lib/logger';

const dataRoot = path.join(process.cwd(), "src", "data", "items");

export type CategoryWithCount = (typeof categories)[number] & { count: number };

export function getCategoriesWithCounts(): CategoryWithCount[] {
  return categories
    .slice()
    .sort((a,b) => (a.order ?? 999) - (b.order ?? 999))
    .map((c) => ({ ...c, count: getItemsByCategory(c.id).length }));
}

export function getItemsByCategory(categoryId: string): Item[] {
  // Validate categoryId to prevent path traversal attacks
  if (!categoryId || typeof categoryId !== 'string' || 
      categoryId.length > 50 || 
      /[^a-z0-9\-_]/.test(categoryId) || 
      categoryId.includes('..')) {
    return [];
  }
  
  const file = path.join(dataRoot, `${categoryId}.json`);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  let parsed: unknown[] = [];
  try { 
    const jsonResult = JSON.parse(raw);
    // Validate that parsed result is actually an array
    if (Array.isArray(jsonResult)) {
      parsed = jsonResult;
    } else {
      console.warn(`Data file ${categoryId}.json does not contain an array, got:`, typeof jsonResult);
      return [];
    }
  } catch (err) { 
    console.warn(`Failed to parse JSON from ${categoryId}.json:`, err);
    return []; 
  }
  const items: Item[] = [];
  for (const i of parsed) {
    if (!i || typeof i !== "object") continue;
    const obj = i as Record<string, unknown>;
    const name = typeof obj["name"] === "string" ? (obj["name"] as string) : "";
    const result = ItemSchema.safeParse({ ...(obj as object), slug: toSlug(name) });
    if (result.success) {
      items.push(result.data);
    } else {
      // Log a compact error summary without throwing to keep category load resilient
      logger.warn('Invalid item skipped in category data', {
        issues: result.error.issues.map(iss => ({ path: iss.path, code: iss.code, message: iss.message })).slice(0, 5)
      });
    }
  }
  return items;
}

export function getItem(categoryId: string, slug: string): Item | null {
  // Validate inputs to prevent injection attacks
  if (!categoryId || !slug || 
      typeof categoryId !== 'string' || typeof slug !== 'string' ||
      categoryId.length > 50 || slug.length > 100 ||
      /[^a-z0-9\-_]/.test(categoryId) || /[^a-z0-9\-_]/.test(slug) ||
      categoryId.includes('..') || slug.includes('..')) {
    return null;
  }
  
  const items = getItemsByCategory(categoryId);
  return items.find((i) => (i.slug ?? toSlug(i.name)) === slug) ?? null;
}

export function isRecentlyUpdated(item: Item, days = 30): boolean {
  if (!item.updatedAt) return false;
  const updated = Date.parse(item.updatedAt);
  if (isNaN(updated)) return false;
  return Date.now() - updated < days * 86400_000;
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

export const pickCategoryLocale = (
  cat: import("@/data/schemas").Category,
  key: "title" | "description",
  locale: Locale
) => pickLocale(cat as Record<string, unknown>, key, locale);
