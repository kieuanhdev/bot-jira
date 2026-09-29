import { prisma } from "@/lib/prisma";
import { isKnownProject, jiraProjectList } from "@/lib/env";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";
import {
  type LeaderboardTimeframe,
  type LeaderboardResponse,
  type LeaderboardMember,
  type LeaderboardTaskItem,
  type UserPerformance,
  getTier,
  getNextTier,
  computePeriodBounds,
} from "./types";

export interface GetLeaderboardOptions {
  currentUserId: string;
  timeframe?: LeaderboardTimeframe;
  year?: number;
  month?: number;
  quarter?: number;
  project?: string | null;
}

function generateCheerMessage(
  rank: number,
  points: number,
  pointsToNextRank: number | null,
  nextRankUser: { displayName: string } | null,
  pointsToNextTier: number
): string {
  if (rank === 1) {
    return "👑 Tuyệt vời! Bạn đang dẫn đầu bảng xếp hạng. Hãy tiếp tục giữ vững phong độ!";
  }
  if (rank === 2 || rank === 3) {
    if (pointsToNextRank != null && pointsToNextRank <= 5) {
      return `🔥 Bạn đang ở Top ${rank}! Chỉ cách vị trí trên ${pointsToNextRank} point nữa thôi, bứt phá ngay nào!`;
    }
    return `🎉 Xuất sắc! Bạn vững vàng trong Top ${rank} bục vinh quang. Cố lên để vươn lên ngôi đầu!`;
  }
  if (nextRankUser && pointsToNextRank != null && pointsToNextRank <= 3) {
    return `⚡ Khoảng cách với ${nextRankUser.displayName} chỉ là ${pointsToNextRank} point! Làm thêm 1 task là vượt mặt rồi!`;
  }
  if (pointsToNextTier > 0 && pointsToNextTier <= 5) {
    return `✨ Chỉ còn ${pointsToNextTier} point nữa là bạn sẽ được nâng cấp bậc mới. Đừng bỏ lỡ!`;
  }
  if (points === 0) {
    return "🎯 Chưa có point hoàn thành nào trong kỳ này. Hãy chọn task và bắt tay vào làm ngay nhé!";
  }
  return `💪 Bạn đang ở vị trí #${rank}. Mỗi story point hoàn thành đều giúp đội ngũ tiến nhanh hơn!`;
}

export async function getLeaderboardData(options: GetLeaderboardOptions): Promise<LeaderboardResponse> {
  const { currentUserId, timeframe = "month", year, month, quarter, project } = options;

  // 1. Resolve user & mobile project scope
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, jiraUsername: true, jiraUserEnc: true },
  });

  const myUsername = currentUser ? userJiraUsername(currentUser) : null;
  const myAliases = jiraUsernameAliases(myUsername).map((a) => a.toLowerCase());

  // Leaderboard tracks all mobile projects, not restricted to individual board settings
  const mobileProjects = [...new Set(jiraProjectList)];
  const projectsInScope = project && isKnownProject(project) ? [project] : mobileProjects;

  // 2. Compute date range
  const period = computePeriodBounds(timeframe, year, month, quarter);

  // 3. Query all users from DB to enrich profile information
  const dbUsers = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      jiraUsername: true,
      email: true,
      role: true,
    },
  });

  // Build alias lookup map: lowercase alias -> dbUser
  const userMap = new Map<string, (typeof dbUsers)[0]>();
  for (const u of dbUsers) {
    if (u.jiraUsername) {
      for (const alias of jiraUsernameAliases(u.jiraUsername)) {
        userMap.set(alias.toLowerCase(), u);
      }
    }
  }

  // 4. Query all issues in scope with points
  const issues = await prisma.issueCache.findMany({
    where: {
      deletedAt: null,
      projectKey: { in: projectsInScope },
      points: { not: null },
    },
    select: {
      jiraKey: true,
      summary: true,
      status: true,
      statusCategory: true,
      statusChangedAt: true,
      updatedAt: true,
      createdAt: true,
      assigneeJira: true,
      points: true,
      priority: true,
      projectKey: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  // 5. Aggregate points per member
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

  const memberMap = new Map<string, MemberAccumulator>();

  // Ensure DB users are pre-populated so team members with 0 points are also present
  for (const u of dbUsers) {
    if (!u.jiraUsername) continue;
    const norm = u.jiraUsername.toLowerCase().replace(/_mb$/i, "");
    if (!memberMap.has(norm)) {
      const isCurrent = myAliases.includes(norm);
      memberMap.set(norm, {
        jiraUsername: u.jiraUsername,
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
  }

  for (const issue of issues) {
    const rawAssignee = (issue.assigneeJira ?? "").trim();
    if (!rawAssignee) continue;

    const normKey = rawAssignee.toLowerCase().replace(/_mb$/i, "");
    const pts = issue.points ?? 0;
    if (pts <= 0) continue;

    // Resolve member record
    let member = memberMap.get(normKey);
    if (!member) {
      const matchedUser = userMap.get(rawAssignee.toLowerCase());
      const isCurrent = myAliases.includes(normKey);
      member = {
        jiraUsername: matchedUser?.jiraUsername ?? rawAssignee,
        displayName: matchedUser?.displayName ?? rawAssignee,
        email: matchedUser?.email ?? null,
        role: matchedUser?.role ?? null,
        completedPoints: 0,
        inProgressPoints: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        isCurrentUser: isCurrent,
        tasks: [],
      };
      memberMap.set(normKey, member);
    }

    const isDone = issue.statusCategory.toLowerCase() === "done";
    const completionDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;

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
      // For active/in-progress tasks, attribute them to current period
      if (period.isCurrentPeriod) {
        member.inProgressPoints += pts;
        member.inProgressTasks += 1;
        member.tasks.push(taskItem);
      }
    }
  }

  // 6. Calculate totals and sort
  const allMembersList = Array.from(memberMap.values());

  // Filter out users who have 0 activity in all-time/specific periods if there are many,
  // but keep anyone with points or tasks, and keep current user
  const activeMembers = allMembersList.filter(
    (m) => m.completedPoints > 0 || m.inProgressPoints > 0 || m.isCurrentUser
  );

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

  // 7. Assign ranks, tier badges, and share percentage
  const rankedMembers: LeaderboardMember[] = activeMembers.map((m, idx) => {
    const rank = idx + 1;
    const tier = getTier(m.completedPoints);
    const sharePercentage = totalTeamPoints > 0 ? Math.round((m.completedPoints / totalTeamPoints) * 100) : 0;

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

  // 8. Personal Performance evaluation
  let myPerformance: UserPerformance | null = null;
  const myIndex = rankedMembers.findIndex((m) => m.isCurrentUser);

  if (myIndex !== -1) {
    const me = rankedMembers[myIndex];
    const prevMember = myIndex > 0 ? rankedMembers[myIndex - 1] : null;
    const pointsToNextRank = prevMember ? Math.max(1, prevMember.completedPoints - me.completedPoints + 1) : null;
    const tierInfo = getNextTier(me.completedPoints);

    myPerformance = {
      rank: me.rank,
      completedPoints: me.completedPoints,
      inProgressPoints: me.inProgressPoints,
      pointsToNextRank,
      nextRankUser: prevMember ? { displayName: prevMember.displayName, points: prevMember.completedPoints } : null,
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

  const topPerformer = rankedMembers.length > 0 && rankedMembers[0].completedPoints > 0
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
    project: project && isKnownProject(project) ? project : null,
    projects: mobileProjects,
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
