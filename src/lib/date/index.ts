import { TZDate } from "@date-fns/tz";
import {
  addDays,
  differenceInCalendarDays,
  isWeekend,
  startOfDay,
  startOfISOWeek,
} from "date-fns";

export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

export type DateKey = string; // YYYY-MM-DD

/**
 * Checks whether a value is a valid calendar date string in YYYY-MM-DD format.
 */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Converts a DateKey (YYYY-MM-DD) to a UTC midnight Date.
 * Storage convention for dueDate, releaseDate, snapshotDate. Throws on invalid date key.
 */
export function dateKeyToUtcMidnight(key: DateKey): Date {
  if (!isDateKey(key)) {
    throw new Error(`Invalid DateKey: "${key}"`);
  }
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Converts a UTC midnight Date back to DateKey (YYYY-MM-DD).
 */
export function utcMidnightToDateKey(d: Date): DateKey {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns year, month (1-12), day, and weekday (0=Sun) of an instant in the specified timezone.
 */
export function zonedParts(
  instant: Date,
  tz: string = APP_TIMEZONE,
): { year: number; month: number; day: number; weekday: number } {
  const tzd = new TZDate(instant, tz);
  if (Number.isNaN(tzd.getTime())) {
    throw new RangeError(`Invalid time zone or date: "${tz}"`);
  }
  return {
    year: tzd.getFullYear(),
    month: tzd.getMonth() + 1,
    day: tzd.getDate(),
    weekday: tzd.getDay(),
  };
}

/**
 * Returns the calendar day (YYYY-MM-DD) of an instant in the specified timezone.
 */
export function toDateKey(instant: Date, tz: string = APP_TIMEZONE): DateKey {
  const parts = zonedParts(instant, tz);
  const y = parts.year;
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Adds (or subtracts) calendar days to a DateKey.
 */
export function addDaysToKey(key: DateKey, days: number): DateKey {
  const d = dateKeyToUtcMidnight(key);
  const next = addDays(new TZDate(d, "UTC"), days);
  return utcMidnightToDateKey(next);
}

/**
 * Computes calendar days difference (to - from). May be negative.
 */
export function diffDays(from: DateKey, to: DateKey): number {
  const fromDate = dateKeyToUtcMidnight(from);
  const toDate = dateKeyToUtcMidnight(to);
  return differenceInCalendarDays(
    new TZDate(toDate, "UTC"),
    new TZDate(fromDate, "UTC"),
  );
}

/**
 * Returns an instant (Date) corresponding to 00:00 on the given calendar date in the specified timezone.
 * month1 is 1-indexed (1-12).
 */
export function zonedMidnight(
  year: number,
  month1: number,
  day: number,
  tz: string = APP_TIMEZONE,
): Date {
  const tzd = new TZDate(year, month1 - 1, day, tz);
  if (Number.isNaN(tzd.getTime())) {
    throw new RangeError(`Invalid time zone or date: "${tz}"`);
  }
  return new Date(tzd.getTime());
}

/**
 * Returns the instant corresponding to local 00:00 for the day of instant in the specified timezone.
 */
export function startOfDayInTz(
  instant: Date,
  tz: string = APP_TIMEZONE,
): Date {
  const tzd = new TZDate(instant, tz);
  if (Number.isNaN(tzd.getTime())) {
    throw new RangeError(`Invalid time zone or date: "${tz}"`);
  }
  const sod = startOfDay(tzd);
  return new Date(sod.getTime());
}

/**
 * Returns the DateKey of the Monday of the ISO week containing instant in the specified timezone.
 */
export function startOfIsoWeekKey(
  instant: Date,
  tz: string = APP_TIMEZONE,
): DateKey {
  const tzd = new TZDate(instant, tz);
  if (Number.isNaN(tzd.getTime())) {
    throw new RangeError(`Invalid time zone or date: "${tz}"`);
  }
  const start = startOfISOWeek(tzd);
  return toDateKey(start, tz);
}

/**
 * Counts business days (Monday to Friday) inclusively from DateKey to DateKey.
 * Returns 0 if to < from.
 */
export function businessDaysInclusive(from: DateKey, to: DateKey): number {
  const fromDate = dateKeyToUtcMidnight(from);
  const toDate = dateKeyToUtcMidnight(to);
  if (fromDate > toDate) {
    return 0;
  }
  let count = 0;
  let cur = new TZDate(fromDate, "UTC");
  const end = new TZDate(toDate, "UTC");
  while (cur <= end) {
    if (!isWeekend(cur)) {
      count++;
    }
    cur = addDays(cur, 1);
  }
  return count;
}
