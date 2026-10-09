import { prisma } from "@/lib/prisma";
import {
  getMidnightDate,
  calculateSnapshotMetrics,
  type SnapshotIssue,
  type SnapshotProjectResult,
  type CaptureSnapshotsOptions,
  type CaptureSnapshotsResult,
} from "./snapshot";

/**
 * Capture daily aggregate report snapshots for projects and their active fix versions.
 * Idempotently upserts by (snapshotDate, projectKey, jiraVersionId).
 */
export async function captureProjectReportSnapshots(
  options: CaptureSnapshotsOptions = {}
): Promise<CaptureSnapshotsResult> {
  const timezone = options.timezone ?? "Asia/Ho_Chi_Minh";
  const snapshotDate = getMidnightDate(options.targetDate ?? new Date(), timezone);
  const now = new Date();

  // Find target project keys
  let targetKeys: string[] = [];
  if (options.projectKey) {
    targetKeys = [options.projectKey.toUpperCase()];
  } else {
    const activeProjects = await prisma.jiraProject.findMany({
      where: { active: true },
      select: { key: true },
    });
    targetKeys = activeProjects.map((p) => p.key.toUpperCase());
  }

  const results: SnapshotProjectResult[] = [];
  let totalSnapshots = 0;

  for (const projectKey of targetKeys) {
    try {
      const rawIssues = await prisma.issueCache.findMany({
        where: { projectKey },
        select: {
          jiraKey: true,
          projectKey: true,
          summary: true,
          status: true,
          statusCategory: true,
          statusChangedAt: true,
          assigneeJira: true,
          priority: true,
          points: true,
          originalEstimateSeconds: true,
          timeSpent: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          labels: true,
          fixVersionIds: true,
          fixVersionNames: true,
        },
      });

      const issues: SnapshotIssue[] = rawIssues.map((i) => ({
        jiraKey: i.jiraKey,
        projectKey: i.projectKey,
        summary: i.summary,
        status: i.status,
        statusCategory: i.statusCategory,
        statusChangedAt: i.statusChangedAt,
        assigneeJira: i.assigneeJira,
        priority: i.priority,
        points: i.points,
        originalEstimateSeconds: i.originalEstimateSeconds,
        timeSpent: i.timeSpent,
        dueDate: i.dueDate,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        labels: i.labels,
        fixVersionIds: i.fixVersionIds,
        fixVersionNames: i.fixVersionNames,
      }));

      // Find max updatedAt for sourceLastSyncedAt
      let sourceLastSyncedAt: Date | null = null;
      for (const issue of issues) {
        if (issue.updatedAt && (!sourceLastSyncedAt || issue.updatedAt > sourceLastSyncedAt)) {
          sourceLastSyncedAt = issue.updatedAt;
        }
      }

      // 1. Snapshot entire project (jiraVersionId: "")
      const projectMetrics = calculateSnapshotMetrics(issues, now);

      await prisma.projectReportSnapshot.upsert({
        where: {
          snapshotDate_projectKey_jiraVersionId: {
            snapshotDate,
            projectKey,
            jiraVersionId: "",
          },
        },
        create: {
          snapshotDate,
          timezone,
          projectKey,
          jiraVersionId: "",
          versionName: "",
          unit: projectMetrics.unit,
          statusGroups: projectMetrics.statusGroups,
          totalCount: projectMetrics.totalCount,
          doneCount: projectMetrics.doneCount,
          totalPoints: projectMetrics.totalPoints,
          donePoints: projectMetrics.donePoints,
          totalEstimateSeconds: projectMetrics.totalEstimateSeconds,
          doneEstimateSeconds: projectMetrics.doneEstimateSeconds,
          blockedCount: projectMetrics.blockedCount,
          overdueCount: projectMetrics.overdueCount,
          overSlaCount: projectMetrics.overSlaCount,
          unassignedCount: projectMetrics.unassignedCount,
          sourceLastSyncedAt,
          capturedAt: now,
        },
        update: {
          timezone,
          unit: projectMetrics.unit,
          statusGroups: projectMetrics.statusGroups,
          totalCount: projectMetrics.totalCount,
          doneCount: projectMetrics.doneCount,
          totalPoints: projectMetrics.totalPoints,
          donePoints: projectMetrics.donePoints,
          totalEstimateSeconds: projectMetrics.totalEstimateSeconds,
          doneEstimateSeconds: projectMetrics.doneEstimateSeconds,
          blockedCount: projectMetrics.blockedCount,
          overdueCount: projectMetrics.overdueCount,
          overSlaCount: projectMetrics.overSlaCount,
          unassignedCount: projectMetrics.unassignedCount,
          sourceLastSyncedAt,
          capturedAt: now,
        },
      });

      totalSnapshots += 1;
      let versionSnapshots = 0;

      // 2. Snapshot active unarchived releases
      const releases = await prisma.release.findMany({
        where: {
          projectKey,
          archived: false,
        },
        select: {
          jiraVersionId: true,
          version: true,
        },
      });

      for (const release of releases) {
        if (!release.jiraVersionId) continue;

        const releaseIssues = issues.filter(
          (i) =>
            i.fixVersionIds.includes(release.jiraVersionId!) ||
            i.fixVersionNames.includes(release.version)
        );

        if (releaseIssues.length === 0) continue;

        const versionMetrics = calculateSnapshotMetrics(releaseIssues, now);

        await prisma.projectReportSnapshot.upsert({
          where: {
            snapshotDate_projectKey_jiraVersionId: {
              snapshotDate,
              projectKey,
              jiraVersionId: release.jiraVersionId,
            },
          },
          create: {
            snapshotDate,
            timezone,
            projectKey,
            jiraVersionId: release.jiraVersionId,
            versionName: release.version,
            unit: versionMetrics.unit,
            statusGroups: versionMetrics.statusGroups,
            totalCount: versionMetrics.totalCount,
            doneCount: versionMetrics.doneCount,
            totalPoints: versionMetrics.totalPoints,
            donePoints: versionMetrics.donePoints,
            totalEstimateSeconds: versionMetrics.totalEstimateSeconds,
            doneEstimateSeconds: versionMetrics.doneEstimateSeconds,
            blockedCount: versionMetrics.blockedCount,
            overdueCount: versionMetrics.overdueCount,
            overSlaCount: versionMetrics.overSlaCount,
            unassignedCount: versionMetrics.unassignedCount,
            sourceLastSyncedAt,
            capturedAt: now,
          },
          update: {
            timezone,
            versionName: release.version,
            unit: versionMetrics.unit,
            statusGroups: versionMetrics.statusGroups,
            totalCount: versionMetrics.totalCount,
            doneCount: versionMetrics.doneCount,
            totalPoints: versionMetrics.totalPoints,
            donePoints: versionMetrics.donePoints,
            totalEstimateSeconds: versionMetrics.totalEstimateSeconds,
            doneEstimateSeconds: versionMetrics.doneEstimateSeconds,
            blockedCount: versionMetrics.blockedCount,
            overdueCount: versionMetrics.overdueCount,
            overSlaCount: versionMetrics.overSlaCount,
            unassignedCount: versionMetrics.unassignedCount,
            sourceLastSyncedAt,
            capturedAt: now,
          },
        });

        totalSnapshots += 1;
        versionSnapshots += 1;
      }

      results.push({
        projectKey,
        projectSnapshot: true,
        versionSnapshots,
      });
    } catch (err) {
      results.push({
        projectKey,
        projectSnapshot: false,
        versionSnapshots: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    snapshotDate: snapshotDate.toISOString(),
    timezone,
    projectsProcessed: results.length,
    totalSnapshots,
    results,
  };
}
