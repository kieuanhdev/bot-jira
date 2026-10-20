import {
  businessDaysInclusive,
  toDateKey,
  utcMidnightToDateKey,
} from "@/lib/date";

/**
 * Business-days helper (Monday–Friday, no holidays).
 * Used by the stale analytics page to measure "age" and "cycle time"
 * in working days, matching the JIRA work criteria (mục 6).
 */

/**
 * Count the number of business days (Mon–Fri) between two dates.
 * Returns 0 if either date is null/undefined.
 * Partial days (not yet a full 24h since the start-of-day of `from`)
 * are excluded — only fully elapsed business days count.
 */
export function businessDaysBetween(from: Date | null | undefined, to: Date): number {
  if (!from) return 0;
  return businessDaysInclusive(toDateKey(from), toDateKey(to));
}

/**
 * How many business days a task has been overdue relative to its due date.
 * 0 means not yet overdue (due date is in the future or missing).
 */
export function overdueBusinessDays(dueDate: Date | null | undefined, now: Date): number {
  if (!dueDate) return 0;
  const dueKey = utcMidnightToDateKey(dueDate);
  const todayKey = toDateKey(now);
  if (todayKey <= dueKey) return 0;
  return businessDaysInclusive(dueKey, todayKey);
}
