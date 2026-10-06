import {
  type LeaderboardMember,
  type LeaderboardTimeframe,
  type LeaderboardTier,
  LEADERBOARD_TIERS,
} from "@/lib/leaderboard/types";

export const ALL_PROJECTS = "ALL";

// Helper for initials
export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface RealmGroup {
  realm: string;
  tiers: LeaderboardTier[];
}

// Group tiers by realm for cultivation guide modal
export function groupTiersByRealm(tiers: readonly LeaderboardTier[] = LEADERBOARD_TIERS): RealmGroup[] {
  const groups: RealmGroup[] = [];
  for (const tier of tiers) {
    let g = groups.find((grp) => grp.realm === tier.realm);
    if (!g) {
      g = { realm: tier.realm, tiers: [] };
      groups.push(g);
    }
    g.tiers.push(tier);
  }
  return groups;
}

// Query URL builder
export function buildLeaderboardQueryUrl(
  timeframe: LeaderboardTimeframe,
  selectedYear: number,
  selectedMonth: number,
  selectedQuarter: number,
  selectedProject: string
): string {
  const params = new URLSearchParams();
  params.set("timeframe", timeframe);
  params.set("year", selectedYear.toString());
  if (timeframe === "month") params.set("month", selectedMonth.toString());
  if (timeframe === "quarter") params.set("quarter", selectedQuarter.toString());
  if (selectedProject !== ALL_PROJECTS) params.set("project", selectedProject);
  return `/api/leaderboard?${params.toString()}`;
}

// Filter & sort members in table
export function filterAndSortMembers(
  members: LeaderboardMember[],
  searchMember: string,
  sortBy: "completed" | "total" | "tasks"
): LeaderboardMember[] {
  let list = [...members];
  if (searchMember.trim()) {
    const q = searchMember.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.jiraUsername.toLowerCase().includes(q)
    );
  }
  if (sortBy === "total") {
    list.sort((a, b) => b.totalPoints - a.totalPoints || b.completedPoints - a.completedPoints);
  } else if (sortBy === "tasks") {
    list.sort((a, b) => b.completedTasks - a.completedTasks || b.completedPoints - a.completedPoints);
  } else {
    list.sort((a, b) => b.completedPoints - a.completedPoints || b.completedTasks - a.completedTasks);
  }
  return list;
}

// Filter tasks in detail modal
export function filterModalTasks(
  tasks: LeaderboardMember["tasks"] | undefined,
  taskSearch: string
): LeaderboardMember["tasks"] {
  if (!tasks) return [];
  if (!taskSearch.trim()) return tasks;
  const q = taskSearch.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      t.jiraKey.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q)
  );
}
