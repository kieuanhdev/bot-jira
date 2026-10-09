import { statusGroup } from "@/lib/status-groups";
import { computeAges } from "./age";
import { classifyStale, STALE_REASON_LABELS, type StaleReason } from "./classify";
import { slaForStatus, slaExceeded, isBlockedStatus } from "./sla";
import { compareWithBaseline } from "./baseline";
import { overdueBusinessDays } from "./business-days";
import {
  evaluateStandardization,
  type RequirementCode,
} from "@/lib/issues/standardization";
import { isAssigneeMatch } from "./params";
import type {
  BlockedTask,
  BottleneckEntry,
  StaleApiResponse,
  StaleIssueRecord,
  StaleQueryParams,
  StaleTask,
  StandardizationTask,
  Summary,
  SupportEntry,
  TrendPoint,
  WipEntry,
} from "./types";

export interface StaleCalculationContext {
  allowedProjects: string[];
  params: StaleQueryParams;
  myUsername: string | null;
  myAliases: string[];
  now?: Date;
}

/**
 * Computes ISO Monday start of week string (YYYY-MM-DD).
 */
export function getIsoWeekStart(d: Date): string {
  const date = new Date(d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

/**
 * Pure calculator for stale metrics, bottleneck/support/WIP aggregations,
 * and personal work/standardization queues.
 *
 * This function is entirely free of Prisma/IO dependencies.
 */
export function computeStaleInsights(
  issues: StaleIssueRecord[],
  context: StaleCalculationContext,
): StaleApiResponse {
  const { allowedProjects, params, myUsername, myAliases } = context;
  const now = context.now ?? new Date();

  // Assignee and status are applied in memory so filter options remain stable
  // while a facet is selected.
  const scopedIssues = issues.filter(
    (issue) =>
      isAssigneeMatch(issue.assigneeJira, params.assignee, myUsername, myAliases) &&
      (!params.status || issue.status === params.status),
  );

  // WIP: all issues currently in In Progress / In Review in the selected scope.
  const wipStatuses = new Set<string>();
  for (const issue of scopedIssues) {
    const g = statusGroup(issue.status);
    if (g === "In Progress" || g === "In Review") wipStatuses.add(issue.jiraKey);
  }
  const wipCount = wipStatuses.size;

  // Per-assignee WIP breakdown.
  const wipMap = new Map<string, { assignee: string; count: number; statuses: Set<string> }>();
  for (const issue of scopedIssues) {
    const g = statusGroup(issue.status);
    if (g !== "In Progress" && g !== "In Review") continue;
    const key = issue.assigneeJira ?? "(unassigned)";
    const entry = wipMap.get(key) ?? { assignee: key, count: 0, statuses: new Set<string>() };
    entry.count++;
    entry.statuses.add(issue.status);
    wipMap.set(key, entry);
  }
  const wip: WipEntry[] = [...wipMap.values()]
    .map((e) => ({ assignee: e.assignee, taskCount: e.count, statuses: [...e.statuses].sort() }))
    .sort((a, b) => b.taskCount - a.taskCount);

  // Compute age metrics + classification for each issue.
  const allTasks: StaleTask[] = [];
  for (const issue of issues) {
    const ages = computeAges(
      {
        createdAt: issue.createdAt,
        statusChangedAt: issue.statusChangedAt,
        updatedAt: issue.updatedAt,
        status: issue.status,
      },
      now,
    );
    const sla = slaForStatus(issue.status, issue.statusCategory);
    const { exceeded, overBy } = slaExceeded(ages.stateAgeDays, sla);
    if (!exceeded) continue;

    const r = classifyStale({
      status: issue.status,
      statusCategory: issue.statusCategory,
      assigneeJira: issue.assigneeJira,
      labels: issue.labels,
      ages,
    });

    const baseline = compareWithBaseline(issue.points, ages.stateAgeDays);
    const overdue = overdueBusinessDays(issue.dueDate, now);

    allTasks.push({
      jiraKey: issue.jiraKey,
      projectKey: issue.projectKey,
      summary: issue.summary,
      status: issue.status,
      statusGroup: statusGroup(issue.status),
      assigneeJira: issue.assigneeJira,
      type: issue.type,
      priority: issue.priority,
      points: issue.points,
      fixVersionNames: issue.fixVersionNames,
      dueDate: issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : null,
      timeSpent: issue.timeSpent,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      statusChangedAt: issue.statusChangedAt,
      totalAgeDays: ages.totalAgeDays,
      stateAgeDays: ages.stateAgeDays,
      inactiveDays: ages.inactiveDays,
      blockedDays: ages.blockedDays,
      staleReason: r,
      staleReasonLabel: STALE_REASON_LABELS[r],
      severity: sla.severity,
      slaDays: sla.days,
      overByDays: overBy,
      baselineLevel: baseline.level,
      expectedCycleMax: baseline.baseline?.expectedMax ?? null,
      alertThreshold: baseline.baseline?.alertAbove ?? null,
      overdueDays: overdue,
      labels: issue.labels,
    });
  }

  // Apply secondary filters (assignee, status, reason, severity) after classification.
  let filtered = allTasks;
  if (params.assignee) {
    filtered = filtered.filter((t) => isAssigneeMatch(t.assigneeJira, params.assignee, myUsername, myAliases));
  }
  if (params.status) {
    filtered = filtered.filter((t) => t.status === params.status);
  }
  if (params.reason) {
    filtered = filtered.filter((t) => t.staleReason === params.reason);
  }
  if (params.severity) {
    filtered = filtered.filter((t) => t.severity === params.severity);
  }

  // Bottleneck by status.
  const bottleneckMap = new Map<
    string,
    { status: string; group: string; count: number; sumAge: number; totalOverBy: number }
  >();
  for (const t of filtered) {
    const entry = bottleneckMap.get(t.status) ?? {
      status: t.status,
      group: t.statusGroup,
      count: 0,
      sumAge: 0,
      totalOverBy: 0,
    };
    entry.count++;
    entry.sumAge += t.stateAgeDays;
    entry.totalOverBy += t.overByDays;
    bottleneckMap.set(t.status, entry);
  }
  const bottleneck: BottleneckEntry[] = [...bottleneckMap.values()]
    .map((e) => ({ ...e, avgStateAge: Math.round(e.sumAge / e.count) }))
    .sort((a, b) => b.count - a.count || b.totalOverBy - a.totalOverBy);

  // People needing support (grouped by assignee and reason).
  const supportMap = new Map<string, { assignee: string; tasks: StaleTask[] }>();
  for (const t of filtered) {
    const key = t.assigneeJira ?? "(unassigned)";
    const entry = supportMap.get(key) ?? { assignee: key, tasks: [] };
    entry.tasks.push(t);
    supportMap.set(key, entry);
  }
  const support: SupportEntry[] = [...supportMap.values()]
    .map((e) => {
      const reasonCounts = new Map<StaleReason, number>();
      for (const t of e.tasks) {
        reasonCounts.set(t.staleReason, (reasonCounts.get(t.staleReason) ?? 0) + 1);
      }
      return {
        assignee: e.assignee,
        taskCount: e.tasks.length,
        reasons: [...reasonCounts.entries()]
          .map(([r, count]) => ({ reason: r, label: STALE_REASON_LABELS[r], count }))
          .sort((a, b) => b.count - a.count),
        avgStateAge: Math.round(e.tasks.reduce((s, t) => s + t.stateAgeDays, 0) / e.tasks.length),
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount || b.avgStateAge - a.avgStateAge);

  // Longest-blocked tasks.
  const blockedTasks: BlockedTask[] = filtered
    .filter((t) => isBlockedStatus(t.status) && t.blockedDays > 0)
    .sort((a, b) => b.blockedDays - a.blockedDays)
    .slice(0, 20)
    .map((t) => ({
      jiraKey: t.jiraKey,
      summary: t.summary,
      status: t.status,
      assigneeJira: t.assigneeJira,
      blockedDays: t.blockedDays,
      reason: t.staleReason,
      reasonLabel: t.staleReasonLabel,
    }));

  // Weekly trend: 8 weekly buckets with Monday start.
  const trendMap = new Map<string, number>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    trendMap.set(getIsoWeekStart(d), 0);
  }
  for (const t of filtered) {
    const refDate = t.statusChangedAt ?? t.createdAt;
    if (!refDate) continue;
    const wk = getIsoWeekStart(refDate);
    if (trendMap.has(wk)) trendMap.set(wk, (trendMap.get(wk) ?? 0) + 1);
  }
  const trend: TrendPoint[] = [...trendMap.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Filter options for dropdowns.
  const assigneeSet = new Set<string>();
  const statusSet = new Set<string>();
  const reasonSet = new Set<StaleReason>();
  for (const issue of issues) {
    if (issue.assigneeJira) assigneeSet.add(issue.assigneeJira);
    statusSet.add(issue.status);
  }
  for (const t of allTasks) {
    reasonSet.add(t.staleReason);
  }

  // Personal work perspective.
  const myIssues = issues.filter((i) => {
    if (!myUsername) return false;
    const lower = (i.assigneeJira ?? "").toLowerCase();
    return myAliases.some((a) => a.toLowerCase() === lower);
  });
  const myStaleTasks = allTasks.filter((t) => {
    if (!myUsername) return false;
    const lower = (t.assigneeJira ?? "").toLowerCase();
    return myAliases.some((a) => a.toLowerCase() === lower);
  });
  const myWipTasks = myIssues.filter((i) => {
    const g = statusGroup(i.status);
    return g === "In Progress" || g === "In Review";
  });

  // Evaluate standardization across all of user's active issues.
  let stdComplete = 0;
  let stdIncomplete = 0;
  let stdUnknown = 0;
  const missingCounts: Record<RequirementCode, number> = {
    ESTIMATION: 0,
    WORKLOG: 0,
    FIX_VERSION: 0,
    DUE_DATE: 0,
  };
  const standardizationTasks: StandardizationTask[] = [];

  for (const issue of myIssues) {
    const ages = computeAges(
      {
        createdAt: issue.createdAt,
        statusChangedAt: issue.statusChangedAt,
        updatedAt: issue.updatedAt,
        status: issue.status,
      },
      now,
    );
    const sla = slaForStatus(issue.status, issue.statusCategory);
    const { exceeded } = slaExceeded(ages.stateAgeDays, sla);
    const overdue = overdueBusinessDays(issue.dueDate, now);
    const isBlocked = isBlockedStatus(issue.status) || ages.blockedDays > 0;

    const stdRes = evaluateStandardization({
      points: issue.points,
      originalEstimateSeconds: issue.originalEstimateSeconds,
      timeSpent: issue.timeSpent,
      fixVersionIds: issue.fixVersionIds,
      fixVersionNames: issue.fixVersionNames,
      dueDate: issue.dueDate,
      labels: issue.labels,
    });

    if (stdRes.status === "complete") {
      stdComplete++;
    } else if (stdRes.status === "incomplete") {
      stdIncomplete++;
    } else {
      stdUnknown++;
    }

    for (const m of stdRes.missing) {
      missingCounts[m] = (missingCounts[m] ?? 0) + 1;
    }

    // Only incomplete and unknown tasks enter the actionable queue.
    if (stdRes.status !== "complete") {
      standardizationTasks.push({
        jiraKey: issue.jiraKey,
        projectKey: issue.projectKey,
        summary: issue.summary,
        status: issue.status,
        statusCategory: issue.statusCategory,
        statusGroup: statusGroup(issue.status),
        assigneeJira: issue.assigneeJira,
        type: issue.type,
        priority: issue.priority,
        points: issue.points,
        originalEstimateSeconds: issue.originalEstimateSeconds,
        timeSpent: issue.timeSpent,
        fixVersionNames: issue.fixVersionNames,
        dueDate: issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : null,
        labels: issue.labels,
        policyId: stdRes.policyId,
        policyVersion: stdRes.policyVersion,
        statusResult: stdRes.status,
        required: stdRes.required,
        missing: stdRes.missing,
        satisfied: stdRes.satisfied,
        unknown: stdRes.unknown,
        warnings: stdRes.warnings,
        isStale: exceeded,
        stateAgeDays: ages.stateAgeDays,
        slaDays: sla.days,
        overdueDays: overdue,
        isBlocked,
        blockedDays: ages.blockedDays,
        updatedAt: issue.updatedAt,
        lastSyncedAt: issue.lastSyncedAt,
      });
    }
  }

  // Sort standardization tasks: most missing first, then longest stateAge, then jiraKey.
  standardizationTasks.sort((a, b) => {
    if (b.missing.length !== a.missing.length) {
      return b.missing.length - a.missing.length;
    }
    if (b.stateAgeDays !== a.stateAgeDays) {
      return b.stateAgeDays - a.stateAgeDays;
    }
    return a.jiraKey.localeCompare(b.jiraKey);
  });

  const lastSyncedAt = myIssues.reduce<Date | null>(
    (latest, i) => (!latest || (i.lastSyncedAt && i.lastSyncedAt > latest) ? i.lastSyncedAt : latest),
    null,
  );

  const summary: Summary = {
    totalActive: scopedIssues.length,
    totalStale: filtered.length,
    totalHigh: filtered.filter((t) => t.severity === "high").length,
    totalBlocked: filtered.filter((t) => isBlockedStatus(t.status)).length,
    totalNoAssignee: filtered.filter((t) => t.staleReason === "no_assignee").length,
    worstOverBy: filtered.reduce((m, t) => Math.max(m, t.overByDays), 0),
    totalOverdue: filtered.filter((t) => t.overdueDays > 0).length,
    totalBaselineAlert: filtered.filter((t) => t.expectedCycleMax != null && t.baselineLevel !== "within").length,
    wipCount,
  };

  return {
    tasks: filtered,
    bottleneck,
    support,
    blocked: blockedTasks,
    trend,
    wip,
    filters: {
      projects: allowedProjects,
      assignees: [...assigneeSet].sort(),
      statuses: [...statusSet].sort(),
      reasons: [...reasonSet].sort(),
      reasonLabels: STALE_REASON_LABELS,
    },
    myWork: {
      username: myUsername,
      totalActive: myIssues.length,
      totalStale: myStaleTasks.length,
      wipCount: myWipTasks.length,
      lastSyncedAt,
      standardization: {
        complete: stdComplete,
        incomplete: stdIncomplete,
        unknown: stdUnknown,
        missingCounts,
        tasks: standardizationTasks,
      },
      tasks: myIssues.map((i) => ({
        jiraKey: i.jiraKey,
        summary: i.summary,
        status: i.status,
        points: i.points,
        updatedAt: i.updatedAt,
      })),
    },
    summary,
  };
}
