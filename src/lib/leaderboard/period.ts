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
  const currentYear = year && year >= 2020 && year <= 2040 ? year : now.getFullYear();

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
    const startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));
    const isCurrentPeriod = currentYear === now.getFullYear();
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
    const currentQ =
      quarter && quarter >= 1 && quarter <= 4 ? quarter : Math.floor(now.getMonth() / 3) + 1;
    const startMonth = (currentQ - 1) * 3;
    const endMonth = startMonth + 2;

    const startDate = new Date(Date.UTC(currentYear, startMonth, 1, 0, 0, 0, 0));
    const endDay = new Date(Date.UTC(currentYear, endMonth + 1, 0)).getUTCDate();
    const endDate = new Date(Date.UTC(currentYear, endMonth, endDay, 23, 59, 59, 999));
    const isCurrentPeriod =
      currentYear === now.getFullYear() && currentQ === Math.floor(now.getMonth() / 3) + 1;

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
  const targetMonth = month && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
  const startDate = new Date(Date.UTC(currentYear, targetMonth - 1, 1, 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(currentYear, targetMonth, 0)).getUTCDate();
  const endDate = new Date(Date.UTC(currentYear, targetMonth - 1, endDay, 23, 59, 59, 999));
  const isCurrentPeriod =
    currentYear === now.getFullYear() && targetMonth === now.getMonth() + 1;

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
