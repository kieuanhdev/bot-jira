import type { LeaderboardTier } from "./tiers";

export interface TopPerformerSummary {
  jiraUsername: string;
  displayName: string;
  points: number;
}

export interface LeaderboardSummary {
  totalTeamPoints: number;
  totalTeamTasks: number;
  activeMembersCount: number;
  averagePointsPerMember: number;
  topPerformer: TopPerformerSummary | null;
}

export interface UserPerformance {
  rank: number;
  completedPoints: number;
  inProgressPoints: number;
  pointsToNextRank: number | null;
  nextRankUser: { displayName: string; points: number } | null;
  tier: LeaderboardTier;
  nextTier: LeaderboardTier | null;
  pointsToNextTier: number;
  tierProgressPercent: number;
  cheerMessage: string;
}
