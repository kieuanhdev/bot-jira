/** Keep only the projects the user picked on the Board, or all if none picked. */
export function scopeProjectItems<T extends { selected?: boolean }>(items: T[]): T[] {
  const picked = items.filter((item) => item.selected);
  return picked.length > 0 ? picked : items;
}
