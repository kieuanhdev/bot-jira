import { APP_TIMEZONE, zonedMidnight, zonedParts } from "@/lib/date";
import type {
  LeaderboardTimeframe,
  LeaderboardPeriodBounds,
  LeaderboardFilterParams,
} from "./contracts/filters";

export function computePeriodBounds(
  timeframe: LeaderboardTimeframe = "month",
  year?: number,
  month?: number,
  quarter?: number
): LeaderboardPeriodBounds {
  const now = new Date();
  const nowParts = zonedParts(now, APP_TIMEZONE);
  const currentYear = year && year >= 2020 && year <= 2040 ? year : nowParts.year;

  if (timeframe === "all") {
    return {
      startDate: null,
      endDate: null,
      periodLabel: "Toàn bộ thời gian",
      timeframe: "all" as LeaderboardTimeframe,
      year: null,
      month: null,
      quarter: null,
      isCurrentPeriod: true,
    };
  }

  if (timeframe === "year") {
    const startDate = zonedMidnight(currentYear, 1, 1);
    const endDate = new Date(zonedMidnight(currentYear + 1, 1, 1).getTime() - 1);
    const isCurrentPeriod = currentYear === nowParts.year;
    return {
      startDate,
      endDate,
      periodLabel: `Năm ${currentYear}`,
      timeframe: "year" as LeaderboardTimeframe,
      year: currentYear,
      month: null,
      quarter: null,
      isCurrentPeriod,
    };
  }

  if (timeframe === "quarter") {
    const nowQuarter = Math.floor((nowParts.month - 1) / 3) + 1;
    const currentQ =
      quarter && quarter >= 1 && quarter <= 4 ? quarter : nowQuarter;
    const startMonth = (currentQ - 1) * 3 + 1;
    const startDate = zonedMidnight(currentYear, startMonth, 1);
    const nextYear = currentQ === 4 ? currentYear + 1 : currentYear;
    const nextMonth = currentQ === 4 ? 1 : currentQ * 3 + 1;
    const endDate = new Date(zonedMidnight(nextYear, nextMonth, 1).getTime() - 1);
    const isCurrentPeriod =
      currentYear === nowParts.year && currentQ === nowQuarter;

    return {
      startDate,
      endDate,
      periodLabel: `Quý ${currentQ}/${currentYear}`,
      timeframe: "quarter" as LeaderboardTimeframe,
      year: currentYear,
      month: null,
      quarter: currentQ,
      isCurrentPeriod,
    };
  }

  // Default: month
  const targetMonth = month && month >= 1 && month <= 12 ? month : nowParts.month;
  const startDate = zonedMidnight(currentYear, targetMonth, 1);
  const nextYear = targetMonth === 12 ? currentYear + 1 : currentYear;
  const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
  const endDate = new Date(zonedMidnight(nextYear, nextMonth, 1).getTime() - 1);
  const isCurrentPeriod =
    currentYear === nowParts.year && targetMonth === nowParts.month;

  return {
    startDate,
    endDate,
    periodLabel: `Tháng ${targetMonth}/${currentYear}`,
    timeframe: "month" as LeaderboardTimeframe,
    year: currentYear,
    month: targetMonth,
    quarter: null,
    isCurrentPeriod,
  };
}

export function parseLeaderboardParams(
  params: URLSearchParams | Record<string, string | null | undefined>
): LeaderboardFilterParams {
  const getParam = (k: string): string | null => {
    if (params instanceof URLSearchParams) {
      return params.get(k);
    }
    const val = params[k];
    return val != null ? val : null;
  };

  const timeframeParam = (getParam("timeframe") ?? "month").toLowerCase();
  const timeframe: LeaderboardTimeframe = ["month", "quarter", "year", "all"].includes(
    timeframeParam
  )
    ? (timeframeParam as LeaderboardTimeframe)
    : "month";

  const yearRaw = getParam("year");
  const yearParsed = yearRaw ? parseInt(yearRaw, 10) : undefined;
  const year = Number.isFinite(yearParsed) ? yearParsed : undefined;

  const monthRaw = getParam("month");
  const monthParsed = monthRaw ? parseInt(monthRaw, 10) : undefined;
  const month = Number.isFinite(monthParsed) ? monthParsed : undefined;

  const quarterRaw = getParam("quarter");
  const quarterParsed = quarterRaw ? parseInt(quarterRaw, 10) : undefined;
  const quarter = Number.isFinite(quarterParsed) ? quarterParsed : undefined;

  const projectRaw = getParam("project");
  const project = projectRaw && projectRaw.trim() ? projectRaw.trim().toUpperCase() : null;

  return {
    timeframe,
    year,
    month,
    quarter,
    project,
  };
}

/**
 * Computes default period parameters using Asia/Ho_Chi_Minh timezone
 * so server and client stay synchronized regardless of system local timezone.
 */
export function getDefaultLeaderboardPeriod(date: Date = new Date()) {
  const { year, month } = zonedParts(date, APP_TIMEZONE);
  const quarter = Math.floor((month - 1) / 3) + 1;

  return {
    timeframe: "month" as LeaderboardTimeframe,
    year,
    month,
    quarter,
    project: "ALL" as const,
  };
}

