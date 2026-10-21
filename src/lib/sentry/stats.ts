import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SentryScope } from "./scope";
import { buildProjectCondition } from "./project-condition";
import { triageIssue } from "./triage";
import { spikeOf } from "./spike";

export type SentryDayStat = {
  date: string;
  count: number;
};

export type SentryStats = {
  pendingReview: number;
  criticalPending: number;
  hotCount: number;
  new24h: number;
  noiseRatio: number;
  byDay: SentryDayStat[];
};

function generateEmpty7Days(now: Date): SentryDayStat[] {
  const days: SentryDayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return days;
}

export async function getSentryStats(
  scope: SentryScope = { all: true },
  projectKey?: string,
  now: Date = new Date()
): Promise<SentryStats> {
  const projectCondition = buildProjectCondition(scope, projectKey);
  if (projectCondition === null) {
    // Requested project is outside user's scope
    return {
      pendingReview: 0,
      criticalPending: 0,
      hotCount: 0,
      new24h: 0,
      noiseRatio: 0,
      byDay: generateEmpty7Days(now),
    };
  }

  const baseConditions: Prisma.SentryIssueImportedWhereInput[] = [];
  if (projectCondition) baseConditions.push(projectCondition);
  if (!scope.all) {
    baseConditions.push({ state: { not: "ignored" } });
  }

  // 1. Pending review & triage breakdown
  const pendingWhere: Prisma.SentryIssueImportedWhereInput = {
    AND: [
      ...baseConditions,
      { state: { in: ["pending", "review"] } },
    ],
  };

  // 2. New issues in the last 24h
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const new24hWhere: Prisma.SentryIssueImportedWhereInput = {
    AND: [
      ...baseConditions,
      { createdAt: { gte: twentyFourHoursAgo } },
    ],
  };

  // 3. 7 days sparkline
  const emptyDays = generateEmpty7Days(now);
  const earliestDateStr = emptyDays[0].date;
  const startDate = new Date(`${earliestDateStr}T00:00:00.000Z`);

  const sevenDaysWhere: Prisma.SentryIssueImportedWhereInput = {
    AND: [
      ...baseConditions,
      { createdAt: { gte: startDate } },
    ],
  };

  const [pendingItems, new24h, sevenDayRows] = await Promise.all([
    prisma.sentryIssueImported.findMany({
      where: pendingWhere,
      select: {
        level: true,
        title: true,
        eventCount: true,
        countBaseline: true,
        countBaselineAt: true,
        firstSeen: true,
      },
    }),
    prisma.sentryIssueImported.count({
      where: new24hWhere,
    }),
    prisma.sentryIssueImported.findMany({
      where: sevenDaysWhere,
      select: { createdAt: true },
    }),
  ]);

  let criticalCount = 0;
  let noiseCount = 0;
  let hotCount = 0;
  for (const item of pendingItems) {
    const tier = triageIssue(item).tier;
    if (tier === "critical") criticalCount++;
    else if (tier === "noise") noiseCount++;

    const spike = spikeOf(item, now);
    if (spike.hot) hotCount++;
  }

  const pendingReview = pendingItems.length;
  const noiseRatio =
    pendingReview > 0 ? Number((noiseCount / pendingReview).toFixed(4)) : 0;

  const dayMap = new Map<string, number>();
  for (const d of emptyDays) {
    dayMap.set(d.date, 0);
  }

  for (const row of sevenDayRows) {
    const dStr = row.createdAt.toISOString().slice(0, 10);
    if (dayMap.has(dStr)) {
      dayMap.set(dStr, dayMap.get(dStr)! + 1);
    }
  }

  const byDay = emptyDays.map((d) => ({
    date: d.date,
    count: dayMap.get(d.date) ?? 0,
  }));

  const stats: SentryStats = {
    pendingReview,
    criticalPending: criticalCount,
    hotCount,
    new24h,
    noiseRatio,
    byDay,
  };

  return JSON.parse(JSON.stringify(stats));
}
