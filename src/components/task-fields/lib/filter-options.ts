export function filterLocalOptions(options: string[], query: string, limit: number): string[] {
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  return matches.slice(0, limit);
}
