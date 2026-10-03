import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { ProjectMembersResponse, ReportPeriod, ReportUnit, EffectiveUnit } from "./types";
import { calculateMemberMetrics } from "./member-metrics";
import { calculateCoverage, resolveEffectiveUnit, type ReportIssueInput } from "./metrics";
import { resolveProjectVersionFilter } from "./version";

export interface MemberQueryParams {
  projectKey: string;
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod | null;
  versionId?: string | null;
  unit?: ReportUnit | null;
}

export async function getProjectMembers(
  params: MemberQueryParams
): Promise<ProjectMembersResponse> {
  const normalizedKey = normalizeProjectKey(params.projectKey);
  const { period, comparisonPeriod, versionId } = params;

  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, versionId);
  const whereClause: Prisma.IssueCacheWhereInput = {
    projectKey: normalizedKey,
    deletedAt: null,
    ...(resolvedVersion?.whereInput || {}),
  };

  const rawIssues = await prisma.issueCache.findMany({
    where: whereClause,
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
      raw: true,
    },
  });

  const mappedIssues: ReportIssueInput[] = rawIssues.map((i) => ({
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
    raw: i.raw,
  }));

  const coverage = calculateCoverage(mappedIssues);
  const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(params.unit ?? "auto", coverage);

  // Retrieve user display names
  const assigneeKeys = [
    ...new Set(
      mappedIssues
        .map((i) => i.assigneeJira)
        .filter((a): a is string => Boolean(a && a.trim() !== ""))
    ),
  ];

  const users = await prisma.user.findMany({
    where: { jiraUsername: { in: assigneeKeys } },
    select: { jiraUsername: true, displayName: true },
  });
  const userMap = new Map(
    users
      .filter((u) => Boolean(u.jiraUsername))
      .map((u) => [u.jiraUsername!, u.displayName])
  );

  // Previous period completions if comparison period exists
  let previousCompletions: Map<string, number> | undefined;
  if (comparisonPeriod) {
    const prevMetrics = calculateMemberMetrics({
      issues: mappedIssues,
      from: comparisonPeriod.from,
      to: comparisonPeriod.to,
      timezone: comparisonPeriod.timezone,
      userDisplayNames: userMap,
    });
    previousCompletions = new Map(prevMetrics.map((m) => [m.assignee, m.completedTasks]));
  }

  const members = calculateMemberMetrics({
    issues: mappedIssues,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
    userDisplayNames: userMap,
    previousPeriodCompletions: previousCompletions,
  });

  return {
    members,
    period,
    comparisonPeriod,
    unit: effectiveUnit,
  };
}
