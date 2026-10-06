import { z } from 'zod';

// Query parameters of the paginated admin lists (`?limit=&cursor=`).
export const adminListPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.uuid().optional(),
});

/**
 * Keyset page arguments over (createdAt desc, id desc). Prisma positions
 * `cursor: { id }` using the cursor row's own column values inside the
 * database, so equal and microsecond timestamps are compared there. One extra
 * row detects a next page; one more covers the cursor row itself, which is
 * returned only while it still matches the filter (see toAdminListPage).
 */
export function adminListPageArgs(limit: number, cursor?: string) {
  return {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: limit + 2,
    ...(cursor ? { cursor: { id: cursor } } : {}),
  };
}

// Drops the cursor row by id instead of `skip: 1`, which would drop a different
// row once the cursor row no longer matches the filter (e.g. it was approved).
export function toAdminListPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  cursor?: string,
): { items: T[]; nextCursor: string | null } {
  const remaining = cursor ? rows.filter((row) => row.id !== cursor) : rows;
  const items = remaining.slice(0, limit);
  return { items, nextCursor: remaining.length > limit ? items[items.length - 1].id : null };
}
