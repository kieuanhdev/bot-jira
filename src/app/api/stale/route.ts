import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList } from "@/lib/env";
import { statusGroup } from "@/lib/status-groups";
import { computeAges } from "@/lib/stale/age";
import { classifyStale, STALE_REASON_LABELS, type StaleReason } from "@/lib/stale/classify";
import { slaForStatus, slaExceeded, isBlockedStatus } from "@/lib/stale/sla";

interface StaleTask {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: string;
  assigneeJira: string | null;
  type: string;
  priority: string;
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

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { boardProjects: true },
  });

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  const projectList = (url.searchParams.get("projectList") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(isKnownProject);
  const projects = project && isKnownProject(project)
    ? [project]
    : projectList.length > 0 ? projectList
    : (user?.boardProjects ?? []).filter(isKnownProject).length > 0
      ? (user?.boardProjects ?? []).filter(isKnownProject)
      : jiraProjectList;

  const assignee = (url.searchParams.get("assignee") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const reason = (url.searchParams.get("reason") ?? "").trim() as StaleReason | "";
  const severity = (url.searchParams.get("severity") ?? "").trim();

  const now = new Date();

  // Fetch all open, non-deleted issues in scope.
  const where = {
    deletedAt: null as null,
    projectKey: { in: projects },
    statusCategory: { not: "done" },
    ...(assignee ? { assigneeJira: assignee } : {}),
    ...(status ? { status } : {}),
  };

  const issues = await prisma.issueCache.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });

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

    allTasks.push({
      jiraKey: issue.jiraKey,
      projectKey: issue.projectKey,
      summary: issue.summary,
      status: issue.status,
      statusGroup: statusGroup(issue.status),
      assigneeJira: issue.assigneeJira,
      type: issue.type,
      priority: issue.priority,
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
      labels: issue.labels,
    });
  }

  // Apply secondary filters (reason, severity) after classification.
  let filtered = allTasks;
  if (reason) filtered = filtered.filter((t) => t.staleReason === reason);
  if (severity) filtered = filtered.filter((t) => t.severity === severity);

  // M8-03: bottleneck by status.
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

  // M8-03: people needing support (not a leaderboard — grouped by reason).
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

  // M8-03: longest-blocked tasks.
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

  // M8-03: weekly trend — count of tasks that first exceeded SLA per ISO week
  // over the last 8 weeks. Derived from statusChangedAt (when the task entered
  // its current state) rather than snapshot rows, so the trend reflects the
  // actual pipeline, not detection frequency.
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

  // M8-03: filter options for the dropdowns.
  const assigneeSet = new Set<string>();
  const statusSet = new Set<string>();
  const reasonSet = new Set<StaleReason>();
  for (const t of allTasks) {
    if (t.assigneeJira) assigneeSet.add(t.assigneeJira);
    statusSet.add(t.status);
    reasonSet.add(t.staleReason);
  }

  return NextResponse.json({
    tasks: filtered,
    bottleneck,
    support,
    blocked: blockedTasks,
    trend,
    filters: {
      assignees: [...assigneeSet].sort(),
      statuses: [...statusSet].sort(),
      reasons: [...reasonSet].sort(),
      reasonLabels: STALE_REASON_LABELS,
    },
    summary: {
      totalStale: filtered.length,
      totalBlocked: filtered.filter((t) => isBlockedStatus(t.status)).length,
      totalNoAssignee: filtered.filter((t) => t.staleReason === "no_assignee").length,
      worstOverBy: filtered.reduce((m, t) => Math.max(m, t.overByDays), 0),
    },
  });
}
