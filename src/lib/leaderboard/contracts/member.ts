import type { LeaderboardTier } from "./tiers";
import type { LeaderboardTaskItem } from "./detail";

export interface LeaderboardMember {
  rank: number;
  jiraUsername: string;
  displayName: string;
  email: string | null;
  role: string | null;
  completedPoints: number;
  inProgressPoints: number;
  completedTasks: number;
  inProgressTasks: number;
  totalPoints: number;
  sharePercentage: number;
  tier: LeaderboardTier;
  isCurrentUser: boolean;
  tasks: LeaderboardTaskItem[];
}
