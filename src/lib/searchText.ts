// Accent- and case-insensitive text matching for the guide's search boxes.
// Greek users often type without tonos or in capitals ("ΜΟΥΣΕΙΟ", "μουσειο")
// while the content is accented ("Μουσείο").
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ς/gu, 'σ');
}

/** Items whose name, summary or description contain the query (all fields optional). */
export function filterBySearchText<T extends { name?: string; summary?: string; description?: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = normalizeSearchText(query.trim());
  if (!needle) return [...items];
  return items.filter((item) => normalizeSearchText(
    [item.name, item.summary, item.description].filter(Boolean).join(' '),
  ).includes(needle));
}
