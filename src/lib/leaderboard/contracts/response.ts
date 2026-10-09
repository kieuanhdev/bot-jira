import type { LeaderboardTimeframe } from "./filters";
import type { LeaderboardMember } from "./member";
import type { LeaderboardSummary, UserPerformance } from "./summary";

export interface LeaderboardResponse {
  timeframe: LeaderboardTimeframe;
  periodLabel: string;
  year: number | null;
  month: number | null;
  quarter: number | null;
  project: string | null;
  projects: string[];
  members: LeaderboardMember[];
  summary: LeaderboardSummary;
  myPerformance: UserPerformance | null;
}
