import { jiraUsernameAliases } from "@/lib/user-creds";
import type {
  LeaderboardPeriodBounds,
  LeaderboardResponse,
  LeaderboardMember,
  LeaderboardTaskItem,
  UserPerformance,
} from "./contracts";
import { getTier, getNextTier } from "./tiers";

export interface RawLeaderboardIssue {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  statusChangedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date | null;
  assigneeJira: string | null;
  points: number | null;
  priority: string | null;
  projectKey: string;
  raw?: unknown;
  completedAt?: Date | null;
}

export interface LeaderboardDbUser {
  id: string;
  displayName: string;
  jiraUsername: string | null;
  email: string | null;
  role: string | null;
}

export interface CalculateLeaderboardInput {
  period: LeaderboardPeriodBounds;
  issues: RawLeaderboardIssue[];
  dbUsers: LeaderboardDbUser[];
  myAliases: string[];
  activeProjects: string[];
  selectedProject: string | null;
}

/**
 * Accounts excluded from the mobile team leaderboard / ranking.
 */
export const EXCLUDED_LEADERBOARD_ACCOUNTS: ReadonlySet<string> = new Set([
  "quangtn",
  "hoangld",
  "tinhvt",
  "ducpm2",
  "binhht",
  "hungkd_cic",
  "hungkd",
]);

export function isExcludedLeaderboardUser(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  const username = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  return EXCLUDED_LEADERBOARD_ACCOUNTS.has(username.replace(/_mb$/i, ""));
}

export function generateCheerMessage(
  rank: number,
  points: number,
  pointsToNextRank: number | null,
  nextRankUser: { displayName: string } | null,
  pointsToNextTier: number
): string {
  if (rank === 1) {
    return "👑 Đạo hạnh thông thiên! Đạo hữu đang đứng trên đỉnh cao tiên lộ, xưng bá toàn tông môn!";
  }
  if (rank === 2 || rank === 3) {
    if (pointsToNextRank != null && pointsToNextRank <= 5) {
      return `🔥 Đạo hạnh thâm hậu! Bạn đang ở Top ${rank}, chỉ cách đạo hữu phía trên ${pointsToNextRank} tu vi (point), mau mau bứt phá!`;
    }
    return `🎉 Tuyệt đỉnh chân nhân! Bạn vững vàng trong Top ${rank} tông môn, sắp sửa chạm tay vào ngôi vị Đạo Tổ!`;
  }
  if (nextRankUser && pointsToNextRank != null && pointsToNextRank <= 3) {
    return `⚡ Khoảng cách với đạo hữu ${nextRankUser.displayName} chỉ là ${pointsToNextRank} tu vi! Luyện thêm 1 task là vượt mặt rồi!`;
  }
  if (pointsToNextTier > 0 && pointsToNextTier <= 5) {
    return `✨ Chỉ còn ${pointsToNextTier} point tu vi nữa là độ kiếp đột phá cảnh giới mới. Thiên kiếp sắp giáng, vững tâm tu luyện!`;
  }
  if (points === 0) {
    return "🎯 Đạo hữu hiện tại là Phàm Nhân chưa nhập đạo. Hãy nhận 1 nhiệm vụ tông môn để bắt đầu con đường tu tiên!";
  }
  return `💪 Bạn đang ở thứ hạng #${rank}. Mỗi story point hoàn thành là một phần công đức giúp tông môn hưng thịnh!`;
}

export function resolveCompletionDate(issue: RawLeaderboardIssue): Date | null {
  const raw =
    issue.raw && typeof issue.raw === "object" ? (issue.raw as Record<string, unknown>) : null;
  const rawDoneAt =
    raw && typeof raw.customfield_10706 === "string" ? new Date(raw.customfield_10706) : null;
  const rawResolution =
    raw && typeof raw.resolutiondate === "string" ? new Date(raw.resolutiondate) : null;

  // Ưu tiên Done At (customfield_10706) -> resolutiondate -> statusChangedAt -> updatedAt -> createdAt
  return (
    rawDoneAt ??
    rawResolution ??
    issue.completedAt ??
    issue.statusChangedAt ??
    issue.updatedAt ??
    issue.createdAt ??
    null
  );
}

interface MemberAccumulator {
  jiraUsername: string;
  displayName: string;
  email: string | null;
  role: string | null;
  completedPoints: number;
  inProgressPoints: number;
  completedTasks: number;
  inProgressTasks: number;
  isCurrentUser: boolean;
  tasks: LeaderboardTaskItem[];
}

export function calculateLeaderboard(input: CalculateLeaderboardInput): LeaderboardResponse {
  const { period, myAliases, activeProjects, selectedProject } = input;

  // Lọc bỏ các tài khoản bị loại trừ ngay từ đầu vào
  const issues = input.issues.filter((i) => !isExcludedLeaderboardUser(i.assigneeJira));
  const dbUsers = input.dbUsers.filter(
    (u) => !isExcludedLeaderboardUser(u.jiraUsername) && !isExcludedLeaderboardUser(u.email)
  );

  const memberMap = new Map<string, MemberAccumulator>();
  const aliasToMemberKey = new Map<string, string>();

  // Pre-populate DB users so team members with 0 points are also present.
  // dbUsers contains only users who have logged in with a Jira token.
  for (const u of dbUsers) {
    const rawUsername = u.jiraUsername || (u.email ? u.email.split("@")[0] : null) || u.displayName;
    const norm = rawUsername.toLowerCase().replace(/_mb$/i, "");
    if (!memberMap.has(norm)) {
      const isCurrent = myAliases.some(
        (alias) => alias.toLowerCase().replace(/_mb$/i, "") === norm
      );
      memberMap.set(norm, {
        jiraUsername: u.jiraUsername ?? rawUsername,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        completedPoints: 0,
        inProgressPoints: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        isCurrentUser: isCurrent,
        tasks: [],
      });
    }

    if (u.jiraUsername) {
      for (const alias of jiraUsernameAliases(u.jiraUsername)) {
        aliasToMemberKey.set(alias.toLowerCase(), norm);
      }
    }
    if (u.email) {
      for (const alias of jiraUsernameAliases(u.email)) {
        aliasToMemberKey.set(alias.toLowerCase(), norm);
      }
    }
    aliasToMemberKey.set(rawUsername.toLowerCase(), norm);
    aliasToMemberKey.set(norm, norm);
  }

  for (const issue of issues) {
    const rawAssignee = (issue.assigneeJira ?? "").trim();
    if (!rawAssignee) continue;

    const normKey = rawAssignee.toLowerCase().replace(/_mb$/i, "");
    const pts = issue.points ?? 0;
    if (pts <= 0) continue;

    // Resolve member record - ONLY for users who have logged in with Jira token
    const memberKey =
      aliasToMemberKey.get(rawAssignee.toLowerCase()) ??
      aliasToMemberKey.get(normKey) ??
      (memberMap.has(normKey) ? normKey : null);

    if (!memberKey) {
      // Assignee has not logged in with Jira token -> excluded from leaderboard
      continue;
    }

    const member = memberMap.get(memberKey);
    if (!member) {
      continue;
    }

    const isDone = issue.statusCategory.toLowerCase() === "done";
    const completionDate = resolveCompletionDate(issue);

    const taskItem: LeaderboardTaskItem = {
      jiraKey: issue.jiraKey,
      summary: issue.summary,
      status: issue.status,
      statusCategory: issue.statusCategory,
      points: pts,
      projectKey: issue.projectKey,
      priority: issue.priority,
      completedAt: isDone && completionDate ? completionDate.toISOString() : null,
      updatedAt: issue.updatedAt ? issue.updatedAt.toISOString() : null,
    };

    if (isDone) {
      // Check if completion date falls into period window
      if (
        !period.startDate ||
        !period.endDate ||
        (completionDate &&
          completionDate.getTime() >= period.startDate.getTime() &&
          completionDate.getTime() <= period.endDate.getTime())
      ) {
        member.completedPoints += pts;
        member.completedTasks += 1;
        member.tasks.push(taskItem);
      }
    } else {
      // Đối với task chưa hoàn thành (đang bế quan): ghi nhận vào inProgressPoints ở kỳ hiện tại hoặc khi xem toàn thời gian
      if (period.isCurrentPeriod || period.timeframe === "all") {
        member.inProgressPoints += pts;
        member.inProgressTasks += 1;
        member.tasks.push(taskItem);
      }
    }
  }

  const activeMembers = Array.from(memberMap.values());

  activeMembers.sort((a, b) => {
    if (b.completedPoints !== a.completedPoints) {
      return b.completedPoints - a.completedPoints;
    }
    if (b.completedTasks !== a.completedTasks) {
      return b.completedTasks - a.completedTasks;
    }
    if (b.inProgressPoints !== a.inProgressPoints) {
      return b.inProgressPoints - a.inProgressPoints;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  const totalTeamPoints = activeMembers.reduce((sum, m) => sum + m.completedPoints, 0);
  const totalTeamTasks = activeMembers.reduce((sum, m) => sum + m.completedTasks, 0);
  const activeCount = activeMembers.filter((m) => m.completedPoints > 0).length;
  const averagePointsPerMember = activeCount > 0 ? Math.round(totalTeamPoints / activeCount) : 0;

  const rankedMembers: LeaderboardMember[] = activeMembers.map((m, idx) => {
    const rank = idx + 1;
    const tier = getTier(m.completedPoints);
    const sharePercentage =
      totalTeamPoints > 0 ? Math.round((m.completedPoints / totalTeamPoints) * 100) : 0;

    return {
      rank,
      jiraUsername: m.jiraUsername,
      displayName: m.displayName,
      email: m.email,
      role: m.role,
      completedPoints: m.completedPoints,
      inProgressPoints: m.inProgressPoints,
      totalPoints: m.completedPoints + m.inProgressPoints,
      completedTasks: m.completedTasks,
      inProgressTasks: m.inProgressTasks,
      tier,
      sharePercentage,
      isCurrentUser: m.isCurrentUser,
      tasks: m.tasks.sort((t1, t2) => t2.points - t1.points),
    };
  });

  let myPerformance: UserPerformance | null = null;
  const myIndex = rankedMembers.findIndex((m) => m.isCurrentUser);

  if (myIndex !== -1) {
    const me = rankedMembers[myIndex];
    const prevMember = myIndex > 0 ? rankedMembers[myIndex - 1] : null;
    const pointsToNextRank = prevMember
      ? Math.max(1, prevMember.completedPoints - me.completedPoints + 1)
      : null;
    const tierInfo = getNextTier(me.completedPoints);

    myPerformance = {
      rank: me.rank,
      completedPoints: me.completedPoints,
      inProgressPoints: me.inProgressPoints,
      pointsToNextRank,
      nextRankUser: prevMember
        ? { displayName: prevMember.displayName, points: prevMember.completedPoints }
        : null,
      tier: me.tier,
      nextTier: tierInfo?.nextTier ?? null,
      pointsToNextTier: tierInfo?.pointsNeeded ?? 0,
      tierProgressPercent: tierInfo?.progressPercent ?? 100,
      cheerMessage: generateCheerMessage(
        me.rank,
        me.completedPoints,
        pointsToNextRank,
        prevMember,
        tierInfo?.pointsNeeded ?? 0
      ),
    };
  }

  const topPerformer =
    rankedMembers.length > 0 && rankedMembers[0].completedPoints > 0
      ? {
          jiraUsername: rankedMembers[0].jiraUsername,
          displayName: rankedMembers[0].displayName,
          points: rankedMembers[0].completedPoints,
        }
      : null;

  return {
    timeframe: period.timeframe,
    periodLabel: period.periodLabel,
    year: period.year,
    month: period.month,
    quarter: period.quarter,
    project: selectedProject && activeProjects.includes(selectedProject) ? selectedProject : null,
    projects: activeProjects,
    members: rankedMembers,
    summary: {
      totalTeamPoints,
      totalTeamTasks,
      activeMembersCount: activeCount,
      averagePointsPerMember,
      topPerformer,
    },
    myPerformance,
  };
}
