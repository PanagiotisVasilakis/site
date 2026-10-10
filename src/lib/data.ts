import fs from "node:fs";
import path from "node:path";
import type { ZodError } from "zod";
import { ItemSchema, type Item } from "../data/schemas";
import { categories } from "../data/categories";
import type { Locale } from "@/i18n/config";
import { logger } from '@/lib/logger-enterprise';
import { pickLocale } from '@/lib/localize';

const dataRoot = path.join(process.cwd(), "src", "data", "items");

export function getOrderedCategories(): typeof categories {
  return categories
    .slice()
    .sort((a,b) => (a.order ?? 999) - (b.order ?? 999));
}

// Names what is wrong with an item by issue path and code only, never by value; an unknown key is named by its own path.
function describeIssues(issues: ZodError["issues"]): string {
  return issues
    .flatMap((iss) => {
      const paths = iss.code === "unrecognized_keys" ? iss.keys.map((key) => [...iss.path, key]) : [iss.path];
      return paths.map((issuePath) => `${issuePath.map(String).join(".")} (${iss.code})`);
    })
    .join("; ");
}

// Default: resilient, an invalid file or item is logged and skipped. Strict (the build gate): throws instead,
// and also rejects keys the schema does not know, which the default load strips silently.
export function getItemsByCategory(categoryId: string, { strict = false }: { strict?: boolean } = {}): Item[] {
  // Validate categoryId to prevent path traversal attacks
  if (!categoryId || typeof categoryId !== 'string' || 
      categoryId.length > 50 || 
      /[^a-z0-9\-_]/.test(categoryId) || 
      categoryId.includes('..')) {
    return [];
  }
  
  const file = path.resolve(dataRoot, `${categoryId}.json`);
  if (!file.startsWith(`${path.resolve(dataRoot)}${path.sep}`)) return [];
  // categoryId is allowlisted above and the resolved path is confined to dataRoot.
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  let jsonResult: unknown;
  try { 
    jsonResult = JSON.parse(raw);
  } catch (err) { 
    // The parser message can quote the file, so the strict error does not forward it.
    if (strict) throw new Error(`Category data file ${categoryId} is not valid JSON`);
    logger.warn('Category data file is not valid JSON', { categoryId, errorName: err instanceof Error ? err.name : typeof err });
    return []; 
  }
  // Validate that parsed result is actually an array
  if (!Array.isArray(jsonResult)) {
    if (strict) throw new Error(`Category data file ${categoryId} does not contain an array`);
    logger.warn('Category data file does not contain an array', { categoryId, receivedType: typeof jsonResult });
    return [];
  }
  const parsed: unknown[] = jsonResult;
  const items: Item[] = [];
  const schema = strict ? ItemSchema.strict() : ItemSchema;
  for (const [index, i] of parsed.entries()) {
    if (!i || typeof i !== "object") {
      if (strict) throw new Error(`Category ${categoryId}: entry ${index} is not an object`);
      continue;
    }
    const obj = i as Record<string, unknown>;
    const name = typeof obj["name"] === "string" ? (obj["name"] as string) : "";
    // An explicit non-empty slug pins the URL; otherwise it derives from the English name.
    const pinned = obj["slug"];
    const slug = typeof pinned === "string" && pinned ? pinned : toSlug(name);
    const result = schema.safeParse({ ...(obj as object), slug });
    if (result.success) {
      items.push(result.data);
    } else if (strict) {
      const id = typeof obj["id"] === "string" ? `, id ${JSON.stringify(obj["id"])}` : "";
      throw new Error(`Invalid item in category ${categoryId} (index ${index}${id}): ${describeIssues(result.error.issues)}`);
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

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export { pickLocale };

export const pickCategoryLocale = (
  cat: import("@/data/schemas").Category,
  key: "title" | "description",
  locale: Locale
) => pickLocale(cat as Record<string, unknown>, key, locale);
