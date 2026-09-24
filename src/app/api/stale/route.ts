import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList } from "@/lib/env";
import { statusGroup } from "@/lib/status-groups";
import { computeAges } from "@/lib/stale/age";
import { classifyStale, STALE_REASON_LABELS, type StaleReason } from "@/lib/stale/classify";
import { slaForStatus, slaExceeded, isBlockedStatus } from "@/lib/stale/sla";
import { compareWithBaseline, type PointAlertLevel } from "@/lib/stale/baseline";
import { overdueBusinessDays } from "@/lib/stale/business-days";

interface StaleTask {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: string;
  assigneeJira: string | null;
  type: string;
  priority: string;
  points: number | null;
  fixVersionNames: string[];
  dueDate: string | null;
  timeSpent: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  statusChangedAt: Date | null;
  totalAgeDays: number;
  stateAgeDays: number;
  inactiveDays: number;
  blockedDays: number;
  staleReason: StaleReason;
  staleReasonLabel: string;
  severity: string;
  slaDays: number;
  overByDays: number;
  baselineLevel: PointAlertLevel;
  expectedCycleMax: number | null;
  alertThreshold: number | null;
  overdueDays: number;
  labels: string[];
}

interface BottleneckEntry {
  status: string;
  group: string;
  count: number;
  avgStateAge: number;
  totalOverBy: number;
}

interface SupportEntry {
  assignee: string;
  taskCount: number;
  reasons: { reason: StaleReason; label: string; count: number }[];
  avgStateAge: number;
}

interface BlockedTask {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  blockedDays: number;
  reason: StaleReason;
  reasonLabel: string;
}

interface TrendPoint {
  week: string;
  count: number;
}

interface WipEntry {
  assignee: string;
  taskCount: number;
  statuses: string[];
}

interface Summary {
  totalActive: number;
  totalStale: number;
  totalHigh: number;
  totalBlocked: number;
  totalNoAssignee: number;
  worstOverBy: number;
  totalOverdue: number;
  totalBaselineAlert: number;
  wipCount: number;
}

import { jiraUsernameAliases } from "@/lib/user-creds";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { boardProjects: true, jiraUsername: true },
  });

  const myUsername = user?.jiraUsername || session.user.jiraUsername || null;
  const myAliases = jiraUsernameAliases(myUsername);

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  const projectList = (url.searchParams.get("projectList") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(isKnownProject);
  const allowedProjects = (user?.boardProjects ?? []).filter(isKnownProject).length > 0
    ? (user?.boardProjects ?? []).filter(isKnownProject)
    : jiraProjectList;
  const projects = project && isKnownProject(project)
    ? [project]
    : projectList.length > 0 ? projectList
    : allowedProjects;

  // `all` is the UI sentinel. Treat it as no filter as a defensive API
  // measure so copied URLs and older clients cannot accidentally hide data.
  const normalizedFilter = (value: string | null) => {
    const normalized = (value ?? "").trim();
    return normalized.toLowerCase() === "all" ? "" : normalized;
  };
  const assignee = normalizedFilter(url.searchParams.get("assignee"));
  const status = normalizedFilter(url.searchParams.get("status"));
  const reason = normalizedFilter(url.searchParams.get("reason")) as StaleReason | "";
  const severity = normalizedFilter(url.searchParams.get("severity"));

  const isMatchAssignee = (issueAssignee: string | null) => {
    if (!assignee) return true;
    if (assignee.toLowerCase() === "me") {
      if (!myUsername) return true;
      const lower = (issueAssignee ?? "").toLowerCase();
      return myAliases.some((a) => a.toLowerCase() === lower);
    }
    if (assignee.toLowerCase() === "unassigned") {
      return !issueAssignee;
    }
    return issueAssignee === assignee;
  };

  const now = new Date();

  // Fetch all open, non-deleted issues in scope.
  const where = {
    deletedAt: null as null,
    projectKey: { in: projects },
    statusCategory: { not: "done" },
  };

  const issues = await prisma.issueCache.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });

  // Assignee and status are applied in memory so filter options remain stable
  // while a facet is selected. This also gives summary denominators a clear,
  // consistent scope.
  const scopedIssues = issues.filter((issue) =>
    isMatchAssignee(issue.assigneeJira) &&
    (!status || issue.status === status)
  );

  // WIP: all issues currently in In Progress / In Review in the selected
  // project/assignee/status scope. Reason and severity only apply to stale work.
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

  // Apply secondary filters (reason, severity) after classification.
  let filtered = allTasks;
  if (assignee) filtered = filtered.filter((t) => isMatchAssignee(t.assigneeJira));
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (reason) filtered = filtered.filter((t) => t.staleReason === reason);
  if (severity) filtered = filtered.filter((t) => t.severity === severity);

  // Bottleneck by status.
  const bottleneckMap = new Map<string, { status: string; group: string; count: number; sumAge: number; totalOverBy: number }>();
  for (const t of filtered) {
    const entry = bottleneckMap.get(t.status) ?? { status: t.status, group: t.statusGroup, count: 0, sumAge: 0, totalOverBy: 0 };
    entry.count++;
    entry.sumAge += t.stateAgeDays;
    entry.totalOverBy += t.overByDays;
    bottleneckMap.set(t.status, entry);
  }
  const bottleneck: BottleneckEntry[] = [...bottleneckMap.values()]
    .map((e) => ({ ...e, avgStateAge: Math.round(e.sumAge / e.count) }))
    .sort((a, b) => b.count - a.count || b.totalOverBy - a.totalOverBy);

  // People needing support (not a leaderboard — grouped by reason).
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

  // Weekly trend — count of tasks that entered their current state per ISO week.
  const weekStart = (d: Date): string => {
    const date = new Date(d);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    date.setHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  };
  const trendMap = new Map<string, number>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    trendMap.set(weekStart(d), 0);
  }
  for (const t of filtered) {
    const refDate = t.statusChangedAt ?? t.createdAt;
    if (!refDate) continue;
    const wk = weekStart(refDate);
    if (trendMap.has(wk)) trendMap.set(wk, (trendMap.get(wk) ?? 0) + 1);
  }
  const trend: TrendPoint[] = [...trendMap.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Filter options for the dropdowns (include all active assignees in scope)
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

  // Personal work perspective
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

  return NextResponse.json({
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
      tasks: myIssues.map((i) => ({
        jiraKey: i.jiraKey,
        summary: i.summary,
        status: i.status,
        points: i.points,
        updatedAt: i.updatedAt,
      })),
    },
    summary,
  });
}
