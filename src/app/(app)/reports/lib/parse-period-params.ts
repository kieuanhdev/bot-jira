import {
  DEFAULT_REPORT_TIMEZONE,
  resolveReportPeriod,
  type ReportPeriod,
} from "@/lib/reports/period";

export type PeriodParamsSource =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined | null>;

/**
 * Parses report period and dates from search parameters using DEFAULT_REPORT_TIMEZONE
 * instead of hardcoded strings. Safe to use in both Server Components and Client Hooks.
 */
export function parsePeriodParams(
  source?: PeriodParamsSource | null,
  now?: Date
): ReportPeriod {
  let period: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let timezone: string | null = null;

  if (source) {
    if (typeof (source as { get?: unknown }).get === "function") {
      const getter = source as { get(name: string): string | null };
      period = getter.get("period");
      from = getter.get("from");
      to = getter.get("to");
      timezone = getter.get("timezone");
    } else {
      const record = source as Record<string, string | string[] | undefined | null>;
      const getVal = (k: string): string | null => {
        const v = record[k];
        if (Array.isArray(v)) return v[0] ?? null;
        return typeof v === "string" ? v : null;
      };
      period = getVal("period");
      from = getVal("from");
      to = getVal("to");
      timezone = getVal("timezone");
    }
  }

  return resolveReportPeriod({
    period: period || "this_week",
    from: from || null,
    to: to || null,
    timezone: timezone || DEFAULT_REPORT_TIMEZONE,
    now,
  }).period;
}
