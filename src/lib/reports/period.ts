import {
  APP_TIMEZONE,
  addDaysToKey,
  dateKeyToUtcMidnight,
  diffDays,
  isDateKey,
  startOfIsoWeekKey,
  toDateKey,
  utcMidnightToDateKey,
} from "@/lib/date";

export type ReportPeriodPreset =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

export interface ReportPeriod {
  preset: ReportPeriodPreset;
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  timezone: string;
}

export interface PeriodResolutionResult {
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod;
  error?: string;
}

export const DEFAULT_REPORT_TIMEZONE = APP_TIMEZONE;

/**
 * Format a Date to YYYY-MM-DD in the given timezone
 */
export function formatDateInTimezone(date: Date, timezone: string = DEFAULT_REPORT_TIMEZONE): string {
  try {
    const key = toDateKey(date, timezone);
    if (!isDateKey(key)) {
      throw new Error(`Invalid formatted date: ${key}`);
    }
    return key;
  } catch {
    // Fallback if timezone is invalid
    return date.toISOString().split("T")[0];
  }
}

/**
 * Parse YYYY-MM-DD into a UTC midnight Date
 */
export function parseDateString(dateStr: string): Date | null {
  if (!isDateKey(dateStr)) return null;
  return dateKeyToUtcMidnight(dateStr);
}

/**
 * Add days to YYYY-MM-DD string
 */
export function addDays(dateStr: string, days: number): string {
  if (!isDateKey(dateStr)) return dateStr;
  return addDaysToKey(dateStr, days);
}

/**
 * Count inclusive days between two YYYY-MM-DD strings
 */
export function countDays(fromStr: string, toStr: string): number {
  if (!isDateKey(fromStr) || !isDateKey(toStr)) return 0;
  return diffDays(fromStr, toStr) + 1;
}

/**
 * Get start of week (Monday) and end of week (Sunday) for a given reference date in timezone
 */
export function getWeekBounds(
  refDate: Date,
  offsetWeeks: number = 0,
  timezone: string = DEFAULT_REPORT_TIMEZONE
): { from: string; to: string } {
  let mondayKey: string;
  try {
    mondayKey = startOfIsoWeekKey(refDate, timezone);
    if (!isDateKey(mondayKey)) {
      throw new Error(`Invalid startOfIsoWeekKey: ${mondayKey}`);
    }
  } catch {
    mondayKey = startOfIsoWeekKey(refDate, "UTC");
  }

  const from = offsetWeeks === 0 ? mondayKey : addDaysToKey(mondayKey, offsetWeeks * 7);
  const to = addDaysToKey(from, 6);

  return { from, to };
}

/**
 * Get start of month and end of month for a given reference date in timezone
 */
export function getMonthBounds(
  refDate: Date,
  offsetMonths: number = 0,
  timezone: string = DEFAULT_REPORT_TIMEZONE
): { from: string; to: string } {
  const todayStr = formatDateInTimezone(refDate, timezone);
  const parts = todayStr.split("-").map(Number);
  const year = parts[0];
  const month = parts[1] - 1; // 0-indexed

  // First day of target month
  const firstDay = new Date(Date.UTC(year, month + offsetMonths, 1));
  // Last day of target month (day 0 of next month)
  const lastDay = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0));

  return {
    from: utcMidnightToDateKey(firstDay),
    to: utcMidnightToDateKey(lastDay),
  };
}

/**
 * Compute the comparison period (immediately preceding period with identical duration)
 */
export function computeComparisonPeriod(period: ReportPeriod): ReportPeriod {
  const days = countDays(period.from, period.to);
  const compTo = addDays(period.from, -1);
  const compFrom = addDays(compTo, -(days - 1));

  return {
    preset: period.preset,
    from: compFrom,
    to: compTo,
    timezone: period.timezone,
  };
}

export interface ResolvePeriodInput {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
  now?: Date;
}

/**
 * Resolve report period and comparison period from query parameters
 */
export function resolveReportPeriod(input: ResolvePeriodInput): PeriodResolutionResult {
  const now = input.now ?? new Date();
  const timezone = input.timezone?.trim() || DEFAULT_REPORT_TIMEZONE;

  const requestedPreset = (input.period?.trim() as ReportPeriodPreset) || "this_week";

  if (requestedPreset === "custom" || (input.from && input.to && !input.period)) {
    const fromStr = input.from?.trim();
    const toStr = input.to?.trim();

    if (!fromStr || !toStr) {
      return {
        period: { preset: "this_week", ...getWeekBounds(now, 0, timezone), timezone },
        comparisonPeriod: computeComparisonPeriod({
          preset: "this_week",
          ...getWeekBounds(now, 0, timezone),
          timezone,
        }),
        error: "Custom date range requires both 'from' and 'to' in YYYY-MM-DD format",
      };
    }

    const fromDate = parseDateString(fromStr);
    const toDate = parseDateString(toStr);

    if (!fromDate || !toDate) {
      return {
        period: { preset: "this_week", ...getWeekBounds(now, 0, timezone), timezone },
        comparisonPeriod: computeComparisonPeriod({
          preset: "this_week",
          ...getWeekBounds(now, 0, timezone),
          timezone,
        }),
        error: "Invalid date format for 'from' or 'to'. Expected YYYY-MM-DD",
      };
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return {
        period: { preset: "this_week", ...getWeekBounds(now, 0, timezone), timezone },
        comparisonPeriod: computeComparisonPeriod({
          preset: "this_week",
          ...getWeekBounds(now, 0, timezone),
          timezone,
        }),
        error: "'from' date cannot be after 'to' date",
      };
    }

    const days = countDays(fromStr, toStr);
    if (days > 732) {
      // 24 months cap (~730 days)
      return {
        period: { preset: "this_week", ...getWeekBounds(now, 0, timezone), timezone },
        comparisonPeriod: computeComparisonPeriod({
          preset: "this_week",
          ...getWeekBounds(now, 0, timezone),
          timezone,
        }),
        error: "Period range cannot exceed 24 months",
      };
    }

    const period: ReportPeriod = {
      preset: "custom",
      from: fromStr,
      to: toStr,
      timezone,
    };
    return {
      period,
      comparisonPeriod: computeComparisonPeriod(period),
    };
  }

  let bounds: { from: string; to: string };
  let preset: ReportPeriodPreset = requestedPreset;

  switch (requestedPreset) {
    case "last_week":
      bounds = getWeekBounds(now, -1, timezone);
      break;
    case "this_month":
      bounds = getMonthBounds(now, 0, timezone);
      break;
    case "last_month":
      bounds = getMonthBounds(now, -1, timezone);
      break;
    case "this_week":
    default:
      preset = "this_week";
      bounds = getWeekBounds(now, 0, timezone);
      break;
  }

  const period: ReportPeriod = {
    preset,
    from: bounds.from,
    to: bounds.to,
    timezone,
  };

  return {
    period,
    comparisonPeriod: computeComparisonPeriod(period),
  };
}

/**
 * Get human readable period title in Vietnamese
 */
export function getPeriodDisplayLabel(period: ReportPeriod): string {
  const fromParts = period.from.split("-");
  const toParts = period.to.split("-");

  const fromFormatted = `${fromParts[2]}/${fromParts[1]}`;
  const toFormatted = `${toParts[2]}/${toParts[1]}/${toParts[0]}`;

  if (period.preset === "this_week") {
    return `Tuần này (${fromFormatted} - ${toFormatted})`;
  }
  if (period.preset === "last_week") {
    return `Tuần trước (${fromFormatted} - ${toFormatted})`;
  }
  if (period.preset === "this_month") {
    return `Tháng này (${fromParts[1]}/${fromParts[0]})`;
  }
  if (period.preset === "last_month") {
    return `Tháng trước (${fromParts[1]}/${fromParts[0]})`;
  }
  return `${fromFormatted} - ${toFormatted}`;
}

/**
 * Navigate to adjacent period (step forward or backward)
 */
export function getAdjacentPeriod(
  period: ReportPeriod,
  direction: "prev" | "next"
): { period: ReportPeriod; comparisonPeriod: ReportPeriod } {
  const days = countDays(period.from, period.to);
  const factor = direction === "next" ? 1 : -1;

  if (period.preset === "this_month" || period.preset === "last_month") {
    // Navigate by month
    const parts = period.from.split("-").map(Number);
    const ref = new Date(Date.UTC(parts[0], parts[1] - 1 + factor, 15));
    const bounds = getMonthBounds(ref, 0, period.timezone);
    const newPeriod: ReportPeriod = {
      preset: "custom",
      from: bounds.from,
      to: bounds.to,
      timezone: period.timezone,
    };
    return {
      period: newPeriod,
      comparisonPeriod: computeComparisonPeriod(newPeriod),
    };
  }

  // Days-based shift
  const newFrom = addDays(period.from, factor * days);
  const newTo = addDays(period.to, factor * days);

  const newPeriod: ReportPeriod = {
    preset: "custom",
    from: newFrom,
    to: newTo,
    timezone: period.timezone,
  };

  return {
    period: newPeriod,
    comparisonPeriod: computeComparisonPeriod(newPeriod),
  };
}

