/**
 * Jira due dates are date-only and stored at 00:00 UTC, so "overdue" must compare
 * against the start of today's calendar date, not the current instant.
 */
export function startOfTodayForDueDates(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function isOverdue(
  dueDate: string | Date | null | undefined,
  done: boolean,
  now: Date = new Date()
): boolean {
  if (!dueDate || done) return false;
  const due = new Date(dueDate);
  return !Number.isNaN(due.getTime()) && due < startOfTodayForDueDates(now);
}
