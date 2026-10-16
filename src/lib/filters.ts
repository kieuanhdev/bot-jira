/**
 * Shared filter constants and helpers across the application.
 */

/** Canonical 'all' filter constant (uppercase). */
export const ALL = "ALL" as const;

/** Lowercase 'all' filter constant (used where existing URL contracts require lowercase). */
export const ALL_LOWER = "all" as const;

export type AllFilterValue = typeof ALL | typeof ALL_LOWER;

/** Checks whether a filter value represents "all" (case-insensitive or empty). */
export function isAllFilter(value: string | undefined | null): boolean {
  if (!value) return true;
  return value.toUpperCase() === ALL;
}
