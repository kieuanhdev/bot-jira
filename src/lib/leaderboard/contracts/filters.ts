export type LeaderboardTimeframe = "month" | "quarter" | "year" | "all";

export interface LeaderboardFilterParams {
  timeframe?: LeaderboardTimeframe;
  year?: number;
  month?: number;
  quarter?: number;
  project?: string | null;
}

export interface GetLeaderboardOptions extends LeaderboardFilterParams {
  currentUserId: string;
}

export interface LeaderboardPeriodBounds {
  startDate: Date | null;
  endDate: Date | null;
  periodLabel: string;
  timeframe: LeaderboardTimeframe;
  year: number | null;
  month: number | null;
  quarter: number | null;
  isCurrentPeriod: boolean;
}
