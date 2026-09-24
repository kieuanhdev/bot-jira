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
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end.getTime() < start.getTime()) return 0;

  let count = 0;
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * How many business days a task has been overdue relative to its due date.
 * 0 means not yet overdue (due date is in the future or missing).
 */
export function overdueBusinessDays(dueDate: Date | null | undefined, now: Date): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (today.getTime() <= due.getTime()) return 0;
  return businessDaysBetween(due, today);
}
