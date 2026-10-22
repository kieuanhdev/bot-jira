import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isDoneCategory } from "@/lib/my-work/service";

export interface BurndownPoint {
  date: string;
  label: string;
  ideal: number;
  actual: number | null;
  forecast?: number | null;
}

export interface BurndownResponse {
  release: {
    id: string;
    version: string;
    projectKey: string;
    startDate: string;
    targetDate: string;
    totalPoints: number;
    remainingPoints: number;
    status: string;
  } | null;
  points: BurndownPoint[];
}

export interface CFDPoint {
  date: string;
  label: string;
  toDo: number;
  inProgress: number;
  testing: number;
  done: number;
}

export interface ReleaseComparisonItem {
  id: string;
  version: string;
  status: string;
  releaseDate: string | null;
  totalTasks: number;
  doneTasks: number;
  completionRate: number;
  totalPoints: number;
  completedPoints: number;
}

/**
 * Calculates daily Burndown data (Ideal vs Actual) for a given release or active project release.
 */
export async function getBurndownData(
  projectKey: string,
  releaseId?: string
): Promise<BurndownResponse> {
  try {
    let release = null;
    if (releaseId && releaseId !== "latest") {
      release = await prisma.release.findUnique({
        where: { id: releaseId },
        include: { tasks: { select: { jiraKey: true } } },
      });
    } else {
      release = await prisma.release.findFirst({
        where: {
          projectKey: projectKey ? { equals: projectKey, mode: "insensitive" } : undefined,
          archived: false,
          status: { in: ["draft", "checking", "ready"] },
        },
        include: { tasks: { select: { jiraKey: true } } },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!release) {
      // Fallback: look for any release in project
      release = await prisma.release.findFirst({
        where: projectKey ? { projectKey: { equals: projectKey, mode: "insensitive" } } : undefined,
        include: { tasks: { select: { jiraKey: true } } },
        orderBy: { createdAt: "desc" },
      });
    }

    const now = new Date();
    if (!release) {
      return { release: null, points: [] };
    }

    const startDate = release.createdAt || new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const targetDate = release.releaseDate || new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    const taskKeys = release.tasks.map((t) => t.jiraKey);
    const issues = await prisma.issueCache.findMany({
      where: taskKeys.length > 0 ? { jiraKey: { in: taskKeys } } : { projectKey: release.projectKey },
      select: {
        jiraKey: true,
        points: true,
        status: true,
        statusCategory: true,
        completedAt: true,
        createdAt: true,
      },
    });

    const totalPoints = issues.reduce((acc, i) => acc + (i.points || 1), 0);
    const totalDays = Math.max(1, Math.ceil((targetDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));

    const points: BurndownPoint[] = [];
    const msInDay = 24 * 60 * 60 * 1000;

    for (let day = 0; day <= totalDays; day++) {
      const currentDay = new Date(startDate.getTime() + day * msInDay);
      const isPastOrToday = currentDay.getTime() <= now.getTime();
      const dateStr = currentDay.toISOString().split("T")[0];
      const label = `${currentDay.getDate()}/${currentDay.getMonth() + 1}`;

      // Ideal linear decline
      const ideal = Math.max(0, Math.round((totalPoints - (totalPoints / totalDays) * day) * 10) / 10);

      let actual: number | null = null;
      if (isPastOrToday) {
        // Calculate points of issues NOT completed by this date
        const pointsDoneByDay = issues
          .filter((i) => {
            if (!isDoneCategory(i.statusCategory, i.status)) return false;
            if (!i.completedAt) return false;
            return new Date(i.completedAt) <= currentDay;
          })
          .reduce((acc, i) => acc + (i.points || 1), 0);

        actual = Math.max(0, totalPoints - pointsDoneByDay);
      }

      points.push({
        date: dateStr,
        label,
        ideal,
        actual,
      });
    }

    const remainingPoints = issues
      .filter((i) => !isDoneCategory(i.statusCategory, i.status))
      .reduce((acc, i) => acc + (i.points || 1), 0);

    return {
      release: {
        id: release.id,
        version: release.version,
        projectKey: release.projectKey,
        startDate: startDate.toISOString(),
        targetDate: targetDate.toISOString(),
        totalPoints,
        remainingPoints,
        status: release.status,
      },
      points,
    };
  } catch (err) {
    logger.error({ message: "getBurndownData failed", error: (err as Error).message });
    return { release: null, points: [] };
  }
}

/**
 * Calculates Cumulative Flow Diagram (CFD) data showing cumulative task distribution over time.
 */
export async function getCFDData(projectKey: string, days: number = 30): Promise<CFDPoint[]> {
  try {
    const now = new Date();
    const windowDays = Math.max(7, Math.min(60, days));
    const msInDay = 24 * 60 * 60 * 1000;
    const startDate = new Date(now.getTime() - windowDays * msInDay);

    const issues = await prisma.issueCache.findMany({
      where: {
        projectKey: projectKey ? { equals: projectKey, mode: "insensitive" } : undefined,
        deletedAt: null,
      },
      select: {
        jiraKey: true,
        status: true,
        statusCategory: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const cfdPoints: CFDPoint[] = [];

    for (let d = 0; d <= windowDays; d += 2) {
      const targetDate = new Date(startDate.getTime() + d * msInDay);
      const dateStr = targetDate.toISOString().split("T")[0];
      const label = `${targetDate.getDate()}/${targetDate.getMonth() + 1}`;

      let done = 0;
      let testing = 0;
      let inProgress = 0;
      let toDo = 0;

      for (const issue of issues) {
        if (issue.createdAt && new Date(issue.createdAt) > targetDate) {
          continue; // Task did not exist yet
        }

        const isDone = isDoneCategory(issue.statusCategory, issue.status);
        if (isDone && issue.completedAt && new Date(issue.completedAt) <= targetDate) {
          done++;
        } else if (/test|qa|review|testing/i.test(issue.status)) {
          testing++;
        } else if (
          issue.statusCategory?.toLowerCase() === "indeterminate" ||
          /progress|doing|processing/i.test(issue.status)
        ) {
          inProgress++;
        } else {
          toDo++;
        }
      }

      cfdPoints.push({
        date: dateStr,
        label,
        done,
        testing: done + testing,
        inProgress: done + testing + inProgress,
        toDo: done + testing + inProgress + toDo,
      });
    }

    return cfdPoints;
  } catch (err) {
    logger.error({ message: "getCFDData failed", error: (err as Error).message });
    return [];
  }
}

/**
 * Compares past releases for velocity, scope completion, and on-time delivery.
 */
export async function getReleaseComparisons(
  projectKey: string
): Promise<ReleaseComparisonItem[]> {
  try {
    const releases = await prisma.release.findMany({
      where: {
        projectKey: projectKey ? { equals: projectKey, mode: "insensitive" } : undefined,
        archived: false,
      },
      include: {
        tasks: {
          select: { jiraKey: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    const results: ReleaseComparisonItem[] = [];

    for (const r of releases) {
      const taskKeys = r.tasks.map((t) => t.jiraKey);
      let totalPoints = 0;
      let completedPoints = 0;
      let doneTasks = 0;

      if (taskKeys.length > 0) {
        const issues = await prisma.issueCache.findMany({
          where: { jiraKey: { in: taskKeys } },
          select: { points: true, status: true, statusCategory: true },
        });

        for (const i of issues) {
          const pts = i.points || 1;
          totalPoints += pts;
          if (isDoneCategory(i.statusCategory, i.status)) {
            doneTasks++;
            completedPoints += pts;
          }
        }
      }

      const totalTasks = taskKeys.length;
      const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      results.push({
        id: r.id,
        version: r.version,
        status: r.status,
        releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
        totalTasks,
        doneTasks,
        completionRate,
        totalPoints,
        completedPoints,
      });
    }

    return results;
  } catch (err) {
    logger.error({ message: "getReleaseComparisons failed", error: (err as Error).message });
    return [];
  }
}
