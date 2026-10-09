import type { LeaderboardTier } from "./tiers";

export interface RealmGroup {
  realm: string;
  tiers: LeaderboardTier[];
}

export type MemberTableSortField = "completed" | "total" | "tasks";

export interface TaskModalFilter {
  searchQuery: string;
}
