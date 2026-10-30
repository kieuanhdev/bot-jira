import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { Prisma } from "@prisma/client";

export interface CurrentUserProfile {
  id: string;
  jiraUsername?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface MyWorkSummary {
  assignedCount: number;
  inProgressCount: number;
  overdueCount: number;
  dueTodayCount: number;
  waitingActionCount: number;
  recentDoneCount: number;
  onTimeRate: number;
  activeRelease?: {
    id: string;
    version: string;
    projectKey: string;
    totalTasks: number;
    doneTasks: number;
    progressPercent: number;
  } | null;
}

export interface MyWorkTaskItem {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  type: string;
  points: number | null;
  dueDate: string | null;
  timeSpent: number | null;
  originalEstimateSeconds: number | null;
  assigneeJira: string | null;
  reporterJira: string | null;
  approverJira: string | null;
  testerJira: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  isWatching?: boolean;
  isOverdue?: boolean;
  isDueToday?: boolean;
  isDueSoon?: boolean;
}

export type TaskRoleFilter = "assigned" | "awaiting_review" | "awaiting_test" | "reported" | "watching";

export interface MyWorkTasksFilter {
  role?: TaskRoleFilter;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface MyWorkAnalytics {
  velocityByWeek: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    tasksDone: number;
    pointsDone: number;
  }>;
  typeDistribution: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  cycleTimeStats: {
    avgCycleTimeDays: number;
    avgLeadTimeDays: number;
    sampleCount: number;
  };
  statusDistribution: Array<{
    status: string;
    statusCategory: string;
    count: number;
  }>;
}

export interface TimelineGroup {
  groupKey: "overdue" | "today" | "tomorrow" | "this_week" | "next_week" | "later" | "no_due_date";
  title: string;
  tasks: MyWorkTaskItem[];
}

const DONE_STATUSES = new Set(["done", "closed", "resolved", "completed"]);

export function isDoneCategory(statusCategory?: string | null, status?: string | null): boolean {
  if (statusCategory?.toLowerCase() === "done") return true;
  if (status && DONE_STATUSES.has(status.toLowerCase())) return true;
  return false;
}

/**
 * Resolves the user's Jira username from the provided profile or database.
 */
export async function resolveJiraUsername(user: CurrentUserProfile): Promise<string | null> {
  if (user.jiraUsername && user.jiraUsername.trim() && user.jiraUsername !== "undefined") {
    return user.jiraUsername.trim();
  }
  if (!user.id) return null;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { jiraUsername: true, email: true, displayName: true },
    });
    if (dbUser?.jiraUsername && dbUser.jiraUsername.trim()) {
      return dbUser.jiraUsername.trim();
    }
    // Fall back to username part of email if available
    if (dbUser?.email && dbUser.email.includes("@")) {
      return dbUser.email.split("@")[0];
    }
    return dbUser?.displayName ?? null;
  } catch (err) {
    logger.warn({ message: "Failed to resolve jiraUsername for user", error: (err as Error).message });
    return null;
  }
}

/**
 * Computes high-level KPI summary cards for the user's personal dashboard.
 */
export async function getMyWorkSummary(user: CurrentUserProfile): Promise<MyWorkSummary> {
  const jiraUser = await resolveJiraUsername(user);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (!jiraUser) {
    return {
      assignedCount: 0,
      inProgressCount: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      waitingActionCount: 0,
      recentDoneCount: 0,
      onTimeRate: 100,
      activeRelease: null,
    };
  }

  try {
    // 1. All active issues assigned to user
    const assignedIssues = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        deletedAt: null,
      },
      select: {
        jiraKey: true,
        status: true,
        statusCategory: true,
        dueDate: true,
        completedAt: true,
      },
    });

    let assignedCount = 0;
    let inProgressCount = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let recentDoneCount = 0;

    for (const issue of assignedIssues) {
      const done = isDoneCategory(issue.statusCategory, issue.status);
      if (!done) {
        assignedCount++;
        const cat = issue.statusCategory?.toLowerCase();
        if (cat === "indeterminate" || /progress|review|processing|testing/i.test(issue.status)) {
          inProgressCount++;
        }
        if (issue.dueDate) {
          const due = new Date(issue.dueDate);
          if (due < startOfToday) {
            overdueCount++;
          } else if (due <= endOfToday) {
            dueTodayCount++;
          }
        }
      } else {
        if (issue.completedAt && new Date(issue.completedAt) >= sevenDaysAgo) {
          recentDoneCount++;
        }
      }
    }

    // 2. Waiting for my action (Approver or Tester, not assigned to me, not done)
    const waitingActionIssues = await prisma.issueCache.findMany({
      where: {
        OR: [
          { approverJira: { equals: jiraUser, mode: "insensitive" } },
          { testerJira: { equals: jiraUser, mode: "insensitive" } },
        ],
        NOT: { assigneeJira: { equals: jiraUser, mode: "insensitive" } },
        deletedAt: null,
      },
      select: {
        status: true,
        statusCategory: true,
      },
    });

    const waitingActionCount = waitingActionIssues.filter(
      (i) => !isDoneCategory(i.statusCategory, i.status)
    ).length;

    // 3. On-time delivery rate (last 30 days)
    const completedWithDue = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        completedAt: { gte: thirtyDaysAgo },
        dueDate: { not: null },
        deletedAt: null,
      },
      select: {
        completedAt: true,
        dueDate: true,
      },
    });

    let onTimeCount = 0;
    for (const item of completedWithDue) {
      if (item.completedAt && item.dueDate && new Date(item.completedAt) <= new Date(item.dueDate)) {
        onTimeCount++;
      }
    }

    const onTimeRate =
      completedWithDue.length > 0 ? Math.round((onTimeCount / completedWithDue.length) * 100) : 100;

    // 4. Active release widget info, limited to projects the user actually belongs to
    // (picked on the Board or assigned as a project member). No projects → no release.
    let activeRelease: MyWorkSummary["activeRelease"] = null;
    const [profile, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { boardProjects: true } }),
      prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectKey: true } }),
    ]);
    const userProjects = Array.from(
      new Set(
        [...(profile?.boardProjects ?? []), ...memberships.map((m) => m.projectKey)].map(
          normalizeProjectKey
        )
      )
    );
    const latestRelease = userProjects.length === 0 ? null : await prisma.release.findFirst({
      where: {
        projectKey: { in: userProjects },
        archived: false,
        status: { in: ["draft", "checking", "ready"] },
      },
      include: {
        tasks: {
          select: {
            jiraKey: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (latestRelease) {
      const taskKeys = latestRelease.tasks.map((t) => t.jiraKey);
      let doneCount = 0;
      if (taskKeys.length > 0) {
        const releaseIssues = await prisma.issueCache.findMany({
          where: { jiraKey: { in: taskKeys } },
          select: { status: true, statusCategory: true },
        });
        doneCount = releaseIssues.filter((i) => isDoneCategory(i.statusCategory, i.status)).length;
      }
      const total = taskKeys.length;
      activeRelease = {
        id: latestRelease.id,
        version: latestRelease.version,
        projectKey: latestRelease.projectKey,
        totalTasks: total,
        doneTasks: doneCount,
        progressPercent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
      };
    }

    return {
      assignedCount,
      inProgressCount,
      overdueCount,
      dueTodayCount,
      waitingActionCount,
      recentDoneCount,
      onTimeRate,
      activeRelease,
    };
  } catch (err) {
    logger.error({ message: "getMyWorkSummary failed", error: (err as Error).message });
    return {
      assignedCount: 0,
      inProgressCount: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      waitingActionCount: 0,
      recentDoneCount: 0,
      onTimeRate: 100,
      activeRelease: null,
    };
  }
}

/**
 * Retrieves tasks tailored to the current user with roles and pagination.
 */
export async function getMyWorkTasks(
  user: CurrentUserProfile,
  filters: MyWorkTasksFilter = {}
): Promise<{ items: MyWorkTaskItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const jiraUser = await resolveJiraUsername(user);
  const role = filters.role ?? "assigned";
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  if (!jiraUser && role !== "watching") {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 1 },
    };
  }

  try {
    const where: Prisma.IssueCacheWhereInput = { deletedAt: null };

    // 1. Role condition
    if (role === "assigned") {
      where.assigneeJira = { equals: jiraUser, mode: "insensitive" };
    } else if (role === "awaiting_review") {
      where.approverJira = { equals: jiraUser, mode: "insensitive" };
    } else if (role === "awaiting_test") {
      where.testerJira = { equals: jiraUser, mode: "insensitive" };
    } else if (role === "reported") {
      where.reporterJira = { equals: jiraUser, mode: "insensitive" };
    } else if (role === "watching") {
      const watched = await prisma.watch.findMany({
        where: { userId: user.id },
        select: { jiraKey: true },
      });
      where.jiraKey = { in: watched.map((w) => w.jiraKey) };
    }

    // 2. Status filter
    if (filters.status && filters.status !== "ALL") {
      if (filters.status === "ACTIVE") {
        where.statusCategory = { not: "done" };
      } else if (filters.status === "DONE") {
        where.statusCategory = "done";
      } else {
        where.status = { equals: filters.status, mode: "insensitive" };
      }
    }

    // 3. Search query
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { jiraKey: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.issueCache.count({ where }),
      prisma.issueCache.findMany({
        where,
        select: {
          jiraKey: true,
          projectKey: true,
          summary: true,
          status: true,
          statusCategory: true,
          priority: true,
          type: true,
          points: true,
          dueDate: true,
          timeSpent: true,
          originalEstimateSeconds: true,
          assigneeJira: true,
          reporterJira: true,
          approverJira: true,
          testerJira: true,
          completedAt: true,
          updatedAt: true,
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    // Check watches for these rows
    const keys = rows.map((r) => r.jiraKey);
    const userWatches = new Set<string>();
    if (keys.length > 0 && user.id) {
      const watches = await prisma.watch.findMany({
        where: { userId: user.id, jiraKey: { in: keys } },
        select: { jiraKey: true },
      });
      for (const w of watches) userWatches.add(w.jiraKey);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const items: MyWorkTaskItem[] = rows.map((r) => {
      let isOverdue = false;
      let isDueToday = false;
      let isDueSoon = false;

      const done = isDoneCategory(r.statusCategory, r.status);
      if (r.dueDate && !done) {
        const d = new Date(r.dueDate);
        if (d < startOfToday) isOverdue = true;
        else if (d <= endOfToday) isDueToday = true;
        else if (d <= threeDaysLater) isDueSoon = true;
      }

      return {
        jiraKey: r.jiraKey,
        projectKey: r.projectKey,
        summary: r.summary,
        status: r.status,
        statusCategory: r.statusCategory,
        priority: r.priority,
        type: r.type,
        points: r.points,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        timeSpent: r.timeSpent,
        originalEstimateSeconds: r.originalEstimateSeconds,
        assigneeJira: r.assigneeJira,
        reporterJira: r.reporterJira,
        approverJira: r.approverJira,
        testerJira: r.testerJira,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
        isWatching: userWatches.has(r.jiraKey),
        isOverdue,
        isDueToday,
        isDueSoon,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  } catch (err) {
    logger.error({ message: "getMyWorkTasks failed", error: (err as Error).message });
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 1 },
    };
  }
}

/**
 * Computes personal productivity analytics (Weekly Velocity, Cycle Time, Type distribution).
 */
export async function getMyWorkAnalytics(
  user: CurrentUserProfile,
  weeks: number = 8
): Promise<MyWorkAnalytics> {
  const jiraUser = await resolveJiraUsername(user);
  const now = new Date();

  if (!jiraUser) {
    return {
      velocityByWeek: [],
      typeDistribution: [],
      cycleTimeStats: { avgCycleTimeDays: 0, avgLeadTimeDays: 0, sampleCount: 0 },
      statusDistribution: [],
    };
  }

  try {
    // 1. Build weekly velocity intervals
    const weekCount = Math.max(4, Math.min(16, weeks));
    const weeklyData: Array<{
      weekLabel: string;
      startDate: Date;
      endDate: Date;
      tasksDone: number;
      pointsDone: number;
    }> = [];

    for (let i = weekCount - 1; i >= 0; i--) {
      const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekNum = getWeekNumber(end);
      weeklyData.push({
        weekLabel: `W${weekNum}`,
        startDate: start,
        endDate: end,
        tasksDone: 0,
        pointsDone: 0,
      });
    }

    const earliestStart = weeklyData[0].startDate;

    // 2. Fetch completed issues for the entire window
    const completedIssues = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        deletedAt: null,
        OR: [
          { completedAt: { gte: earliestStart } },
          { statusChangedAt: { gte: earliestStart }, statusCategory: "done" },
        ],
      },
      select: {
        jiraKey: true,
        points: true,
        type: true,
        createdAt: true,
        statusChangedAt: true,
        completedAt: true,
      },
    });

    let totalCycleTimeMs = 0;
    let cycleTimeCount = 0;
    let totalLeadTimeMs = 0;
    let leadTimeCount = 0;

    for (const issue of completedIssues) {
      const doneDate = issue.completedAt ? new Date(issue.completedAt) : issue.statusChangedAt ? new Date(issue.statusChangedAt) : null;
      if (!doneDate) continue;

      // Map to appropriate week
      for (const w of weeklyData) {
        if (doneDate >= w.startDate && doneDate <= w.endDate) {
          w.tasksDone++;
          w.pointsDone += issue.points ?? 1; // Default to 1 point if unestimated
          break;
        }
      }

      // Compute lead time (created -> completed)
      if (issue.createdAt && doneDate > new Date(issue.createdAt)) {
        const leadMs = doneDate.getTime() - new Date(issue.createdAt).getTime();
        totalLeadTimeMs += leadMs;
        leadTimeCount++;
      }

      // Compute cycle time (statusChangedAt or estimate -> completed)
      if (issue.statusChangedAt && doneDate >= new Date(issue.statusChangedAt)) {
        const cycleMs = doneDate.getTime() - new Date(issue.statusChangedAt).getTime();
        totalCycleTimeMs += cycleMs;
        cycleTimeCount++;
      }
    }

    // 3. Type distribution (last 60 days)
    const recentIssues = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        deletedAt: null,
        updatedAt: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
      },
      select: { type: true },
    });

    const typeCounts: Record<string, number> = {};
    for (const item of recentIssues) {
      const t = item.type || "Task";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const totalTypes = recentIssues.length;
    const typeDistribution = Object.entries(typeCounts).map(([type, count]) => ({
      type,
      count,
      percentage: totalTypes > 0 ? Math.round((count / totalTypes) * 100) : 0,
    }));

    // 4. Current Status Distribution of active tasks
    const activeTasks = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        deletedAt: null,
      },
      select: { status: true, statusCategory: true },
    });

    const statusCounts: Record<string, { category: string; count: number }> = {};
    for (const item of activeTasks) {
      const key = item.status || "Unknown";
      if (!statusCounts[key]) {
        statusCounts[key] = { category: item.statusCategory || "new", count: 0 };
      }
      statusCounts[key].count++;
    }

    const statusDistribution = Object.entries(statusCounts).map(([status, val]) => ({
      status,
      statusCategory: val.category,
      count: val.count,
    }));

    const msInDay = 24 * 60 * 60 * 1000;
    const avgCycleTimeDays =
      cycleTimeCount > 0 ? Math.round((totalCycleTimeMs / cycleTimeCount / msInDay) * 10) / 10 : 0;
    const avgLeadTimeDays =
      leadTimeCount > 0 ? Math.round((totalLeadTimeMs / leadTimeCount / msInDay) * 10) / 10 : 0;

    return {
      velocityByWeek: weeklyData.map((w) => ({
        weekLabel: w.weekLabel,
        startDate: w.startDate.toISOString().split("T")[0],
        endDate: w.endDate.toISOString().split("T")[0],
        tasksDone: w.tasksDone,
        pointsDone: w.pointsDone,
      })),
      typeDistribution,
      cycleTimeStats: {
        avgCycleTimeDays,
        avgLeadTimeDays,
        sampleCount: cycleTimeCount || leadTimeCount,
      },
      statusDistribution,
    };
  } catch (err) {
    logger.error({ message: "getMyWorkAnalytics failed", error: (err as Error).message });
    return {
      velocityByWeek: [],
      typeDistribution: [],
      cycleTimeStats: { avgCycleTimeDays: 0, avgLeadTimeDays: 0, sampleCount: 0 },
      statusDistribution: [],
    };
  }
}

/**
 * Groups active issues by due date for the timeline/Gantt view.
 */
export async function getMyWorkTimeline(
  user: CurrentUserProfile,
  days: number = 14
): Promise<TimelineGroup[]> {
  const jiraUser = await resolveJiraUsername(user);
  if (!jiraUser) return [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000 - 1);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  const endOfNextWeek = new Date(startOfToday.getTime() + days * 24 * 60 * 60 * 1000 - 1);

  try {
    const issues = await prisma.issueCache.findMany({
      where: {
        assigneeJira: { equals: jiraUser, mode: "insensitive" },
        deletedAt: null,
      },
      select: {
        jiraKey: true,
        projectKey: true,
        summary: true,
        status: true,
        statusCategory: true,
        priority: true,
        type: true,
        points: true,
        dueDate: true,
        timeSpent: true,
        originalEstimateSeconds: true,
        assigneeJira: true,
        reporterJira: true,
        approverJira: true,
        testerJira: true,
        completedAt: true,
        updatedAt: true,
      },
      orderBy: { dueDate: "asc" },
    });

    const overdue: MyWorkTaskItem[] = [];
    const today: MyWorkTaskItem[] = [];
    const tomorrow: MyWorkTaskItem[] = [];
    const thisWeek: MyWorkTaskItem[] = [];
    const nextWeek: MyWorkTaskItem[] = [];
    const later: MyWorkTaskItem[] = [];
    const noDueDate: MyWorkTaskItem[] = [];

    for (const r of issues) {
      if (isDoneCategory(r.statusCategory, r.status)) continue;

      const item: MyWorkTaskItem = {
        jiraKey: r.jiraKey,
        projectKey: r.projectKey,
        summary: r.summary,
        status: r.status,
        statusCategory: r.statusCategory,
        priority: r.priority,
        type: r.type,
        points: r.points,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        timeSpent: r.timeSpent,
        originalEstimateSeconds: r.originalEstimateSeconds,
        assigneeJira: r.assigneeJira,
        reporterJira: r.reporterJira,
        approverJira: r.approverJira,
        testerJira: r.testerJira,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      };

      if (!r.dueDate) {
        noDueDate.push(item);
        continue;
      }

      const d = new Date(r.dueDate);
      if (d < startOfToday) {
        item.isOverdue = true;
        overdue.push(item);
      } else if (d <= endOfToday) {
        item.isDueToday = true;
        today.push(item);
      } else if (d <= endOfTomorrow) {
        item.isDueSoon = true;
        tomorrow.push(item);
      } else if (d <= endOfWeek) {
        item.isDueSoon = true;
        thisWeek.push(item);
      } else if (d <= endOfNextWeek) {
        nextWeek.push(item);
      } else {
        later.push(item);
      }
    }

    const groups: TimelineGroup[] = [];
    if (overdue.length > 0) groups.push({ groupKey: "overdue", title: "Quá hạn", tasks: overdue });
    if (today.length > 0) groups.push({ groupKey: "today", title: "Hôm nay", tasks: today });
    if (tomorrow.length > 0) groups.push({ groupKey: "tomorrow", title: "Ngày mai", tasks: tomorrow });
    if (thisWeek.length > 0) groups.push({ groupKey: "this_week", title: "Tuần này", tasks: thisWeek });
    if (nextWeek.length > 0) groups.push({ groupKey: "next_week", title: "Tuần sau", tasks: nextWeek });
    if (later.length > 0) groups.push({ groupKey: "later", title: "Sau đó", tasks: later });
    if (noDueDate.length > 0) groups.push({ groupKey: "no_due_date", title: "Chưa có hạn", tasks: noDueDate });

    return groups;
  } catch (err) {
    logger.error({ message: "getMyWorkTimeline failed", error: (err as Error).message });
    return [];
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
