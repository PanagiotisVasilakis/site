export function nextVisibleCount(current: number, total: number, step: number) {
  if (current >= total) return total;
  return Math.min(total, current + step);
}
