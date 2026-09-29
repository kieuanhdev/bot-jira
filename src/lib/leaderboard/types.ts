export type LeaderboardTimeframe = "month" | "quarter" | "year" | "all";

export interface LeaderboardTier {
  id: string;
  name: string;
  minPoints: number;
  badgeClass: string;
  glowClass: string;
  iconName: "Sparkles" | "Zap" | "Trophy" | "Medal" | "Award" | "Star";
}

export const LEADERBOARD_TIERS: LeaderboardTier[] = [
  {
    id: "legend",
    name: "Huyền Thoại",
    minPoints: 50,
    badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
    glowClass: "ring-purple-500/40 shadow-purple-500/20",
    iconName: "Sparkles",
  },
  {
    id: "diamond",
    name: "Kim Cương",
    minPoints: 30,
    badgeClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    glowClass: "ring-cyan-500/40 shadow-cyan-500/20",
    iconName: "Zap",
  },
  {
    id: "gold",
    name: "Vàng",
    minPoints: 20,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    glowClass: "ring-amber-500/40 shadow-amber-500/20",
    iconName: "Trophy",
  },
  {
    id: "silver",
    name: "Bạc",
    minPoints: 10,
    badgeClass: "bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30",
    glowClass: "ring-slate-400/40 shadow-slate-400/20",
    iconName: "Medal",
  },
  {
    id: "bronze",
    name: "Đồng",
    minPoints: 1,
    badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    glowClass: "ring-orange-500/40 shadow-orange-500/20",
    iconName: "Award",
  },
  {
    id: "rookie",
    name: "Tân Binh",
    minPoints: 0,
    badgeClass: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
    glowClass: "ring-zinc-500/40 shadow-zinc-500/20",
    iconName: "Star",
  },
];

export function getTier(points: number): LeaderboardTier {
  for (const tier of LEADERBOARD_TIERS) {
    if (points >= tier.minPoints) return tier;
  }
  return LEADERBOARD_TIERS[LEADERBOARD_TIERS.length - 1];
}

export function getNextTier(points: number): { nextTier: LeaderboardTier; pointsNeeded: number; progressPercent: number } | null {
  const currentTier = getTier(points);
  const currentIdx = LEADERBOARD_TIERS.findIndex((t) => t.id === currentTier.id);
  if (currentIdx <= 0) {
    return {
      nextTier: currentTier,
      pointsNeeded: 0,
      progressPercent: 100,
    };
  }

  const nextTier = LEADERBOARD_TIERS[currentIdx - 1];
  const pointsInCurrentTier = points - currentTier.minPoints;
  const tierSpan = nextTier.minPoints - currentTier.minPoints;
  const progressPercent = tierSpan > 0 ? Math.min(100, Math.round((pointsInCurrentTier / tierSpan) * 100)) : 100;
  const pointsNeeded = Math.max(0, nextTier.minPoints - points);

  return {
    nextTier,
    pointsNeeded,
    progressPercent,
  };
}

export function computePeriodBounds(
  timeframe: LeaderboardTimeframe = "month",
  year?: number,
  month?: number,
  quarter?: number
) {
  const now = new Date();
  const currentYear = year && year >= 2020 && year <= 2040 ? year : now.getFullYear();

  if (timeframe === "all") {
    return {
      startDate: null,
      endDate: null,
      periodLabel: "Toàn bộ thời gian",
      timeframe: "all" as const,
      year: currentYear,
      isCurrentPeriod: true,
    };
  }

  if (timeframe === "year") {
    const startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));
    return {
      startDate,
      endDate,
      periodLabel: `Năm ${currentYear}`,
      timeframe: "year" as const,
      year: currentYear,
      isCurrentPeriod: currentYear === now.getFullYear(),
    };
  }

  if (timeframe === "quarter") {
    const currentQ = Math.floor(now.getMonth() / 3) + 1;
    const q = quarter && quarter >= 1 && quarter <= 4 ? quarter : currentQ;
    const startMonth = (q - 1) * 3;
    const startDate = new Date(Date.UTC(currentYear, startMonth, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(currentYear, startMonth + 3, 0, 23, 59, 59, 999));
    return {
      startDate,
      endDate,
      periodLabel: `Quý ${q}/${currentYear}`,
      timeframe: "quarter" as const,
      year: currentYear,
      quarter: q,
      isCurrentPeriod: currentYear === now.getFullYear() && q === currentQ,
    };
  }

  // Default: month
  const currentM = now.getMonth() + 1;
  const m = month && month >= 1 && month <= 12 ? month : currentM;
  const startDate = new Date(Date.UTC(currentYear, m - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(currentYear, m, 0, 23, 59, 59, 999));
  return {
    startDate,
    endDate,
    periodLabel: `Tháng ${m}/${currentYear}`,
    timeframe: "month" as const,
    year: currentYear,
    month: m,
    isCurrentPeriod: currentYear === now.getFullYear() && m === currentM,
  };
}

export interface LeaderboardTaskItem {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  points: number;
  projectKey: string;
  priority: string;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface LeaderboardMember {
  rank: number;
  jiraUsername: string;
  displayName: string;
  email: string | null;
  role: string | null;
  completedPoints: number;
  inProgressPoints: number;
  totalPoints: number;
  completedTasks: number;
  inProgressTasks: number;
  tier: LeaderboardTier;
  sharePercentage: number;
  isCurrentUser: boolean;
  tasks: LeaderboardTaskItem[];
}

export interface LeaderboardSummary {
  totalTeamPoints: number;
  totalTeamTasks: number;
  activeMembersCount: number;
  averagePointsPerMember: number;
  topPerformer: {
    jiraUsername: string;
    displayName: string;
    points: number;
  } | null;
}

export interface UserPerformance {
  rank: number;
  completedPoints: number;
  inProgressPoints: number;
  pointsToNextRank: number | null;
  nextRankUser: {
    displayName: string;
    points: number;
  } | null;
  tier: LeaderboardTier;
  nextTier: LeaderboardTier | null;
  pointsToNextTier: number;
  tierProgressPercent: number;
  cheerMessage: string;
}

export interface LeaderboardResponse {
  timeframe: LeaderboardTimeframe;
  periodLabel: string;
  year: number;
  month?: number;
  quarter?: number;
  project: string | null;
  projects: string[];
  members: LeaderboardMember[];
  summary: LeaderboardSummary;
  myPerformance: UserPerformance | null;
}
