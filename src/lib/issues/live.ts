import { prisma } from "@/lib/prisma";
import { jiraIssueFields, jiraPointsFromFields, jiraWith, parseJiraDate } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import type { JiraIssue } from "@/lib/jira/types";
import { upsertJiraComments, upsertJiraIssue } from "@/lib/issues/cache";
import { notifyWatchersOfIssueChange } from "@/lib/issues/notify-watchers";

export type LiveComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string | null;
};

export type LiveIssue = {
  rawIssue: JiraIssue;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersions: string[];
  priority: string;
  points: number | null;
  type: string;
  timeSpentSeconds: number | null;
  originalEstimateSeconds: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: LiveComment[];
};

export type IssueView = {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersions: string[];
  priority: string;
  points: number | null;
  type: string;
  timeSpentSeconds: number | null;
  originalEstimateSeconds: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  comments: LiveComment[];
  aiScore: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: string;
  } | null;
  /** M7 — latest human review of the AI estimate, if any. */
  aiDecision: { decision: string; finalPoints: number | null; decidedAt: string } | null;
  releaseTasks: { release: { version: string; status: string } }[];
  staleSnapshots: {
    ageDays: number;
    detectedAt: string;
    staleReason: string;
    severity: string;
    stateAgeDays: number;
    blockedDays: number;
  }[];
};

/**
 * Fetch a single issue + its comments live from Jira as the given user, and
 * refresh the local cache as a side effect. Returns null when the user has no
 * Jira token or the fetch fails — callers fall back to the cache.
 */
export async function fetchLiveIssue(
  key: string,
  auth: ReturnType<typeof userJiraAuth>
): Promise<LiveIssue | null> {
  if (!auth) return null;
  const client = jiraWith(auth);
  try {
    const extraFields = jiraIssueFields();
    const [issueRes, commentsRes] = await Promise.all([
      client.getIssue(key, extraFields),
      client.getComments(key),
    ]);
    const f = issueRes.fields;
    const { points } = jiraPointsFromFields(f);
    const timeSpentSeconds =
      typeof f.timespent === "number" && Number.isFinite(f.timespent)
        ? Math.round(f.timespent)
        : f.timetracking &&
          typeof (f.timetracking as Record<string, unknown>).timeSpentSeconds === "number" &&
          Number.isFinite((f.timetracking as Record<string, unknown>).timeSpentSeconds)
        ? Math.round((f.timetracking as Record<string, unknown>).timeSpentSeconds as number)
        : null;
    const originalEstimateSeconds =
      typeof f.timeoriginalestimate === "number" && Number.isFinite(f.timeoriginalestimate)
        ? Math.round(f.timeoriginalestimate)
        : f.timetracking &&
          typeof (f.timetracking as Record<string, unknown>).originalEstimateSeconds === "number" &&
          Number.isFinite((f.timetracking as Record<string, unknown>).originalEstimateSeconds)
        ? Math.round((f.timetracking as Record<string, unknown>).originalEstimateSeconds as number)
        : null;

    return {
      rawIssue: issueRes,
      summary: f.summary ?? "",
      description: f.description ?? "",
      status: f.status?.name ?? "",
      assigneeJira: f.assignee?.name ?? null,
      labels: f.labels ?? [],
      fixVersions: (f.fixVersions ?? []).map((v) => v.name ?? "").filter(Boolean),
      priority: f.priority?.name ?? "",
      points,
      type: f.issuetype?.name ?? "",
      timeSpentSeconds,
      originalEstimateSeconds,
      createdAt: f.created ?? null,
      updatedAt: f.updated ?? null,
      comments: commentsRes.map((c) => ({
        id: c.id,
        author: c.author?.displayName || c.author?.name || "",
        body: c.body,
        createdAt: (parseJiraDate(c.created) ?? null)?.toISOString() ?? null,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Build the shape the issue-detail UI expects: prefer live Jira data, fall back
 * to the DB cache. Best-effort writes the cache back so other pages stay in
 * sync. Returns null only when neither live nor cache has the issue.
 */
export async function getIssueView(key: string, auth: ReturnType<typeof userJiraAuth>): Promise<IssueView | null> {
  const live = await fetchLiveIssue(key, auth);
  const cached = await prisma.issueCache.findUnique({
    where: { jiraKey: key },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      aiScore: { include: { decisions: { orderBy: { decidedAt: "desc" }, take: 1 } } },
      releaseTasks: { include: { release: true } },
      staleSnapshots: { orderBy: { detectedAt: "desc" }, take: 1 },
    },
  });

  if (live) {
    // Live reads can see a change before reconciliation. Notify using the old
    // snapshot before its replacement hides that change from the worker.
    try {
      const current = await upsertJiraIssue(live.rawIssue);
      await notifyWatchersOfIssueChange(cached, { jiraKey: key, ...current });
    } catch { /* Live data remains usable if cache or notification delivery fails. */ }
    await upsertJiraComments(
      key,
      live.comments.map((comment) => ({
        id: comment.id,
        author: { displayName: comment.author },
        body: comment.body,
        created: comment.createdAt ?? undefined,
      }))
    ).catch(() => null);

    return {
      jiraKey: key,
      summary: live.summary,
      description: live.description,
      status: live.status,
      assigneeJira: live.assigneeJira,
      labels: live.labels,
      fixVersions: live.fixVersions,
      priority: live.priority,
      points: live.points,
      type: live.type,
      timeSpentSeconds: live.timeSpentSeconds ?? cached?.timeSpent ?? null,
      originalEstimateSeconds: live.originalEstimateSeconds ?? cached?.originalEstimateSeconds ?? null,
      createdAt: parseJiraDate(live.createdAt)?.toISOString() ?? null,
      updatedAt: parseJiraDate(live.updatedAt)?.toISOString() ?? null,
      lastSyncedAt: new Date().toISOString(),
      comments: live.comments,
      aiScore: toAiScore(cached?.aiScore),
      aiDecision: toAiDecision(cached?.aiScore?.decisions),
      releaseTasks: toReleaseTasks(cached?.releaseTasks),
      staleSnapshots: toStale(cached?.staleSnapshots),
    };
  }

  if (!cached) return null;
  return {
    jiraKey: key,
    summary: cached.summary,
    description: cached.description,
    status: cached.status,
    assigneeJira: cached.assigneeJira,
    labels: cached.labels,
    fixVersions: cached.fixVersionNames ?? [],
    priority: cached.priority,
    points: cached.points,
    type: cached.type,
    timeSpentSeconds: cached.timeSpent ?? null,
    originalEstimateSeconds: cached.originalEstimateSeconds ?? null,
    createdAt: cached.createdAt?.toISOString() ?? null,
    updatedAt: cached.updatedAt?.toISOString() ?? null,
    lastSyncedAt: cached.lastSyncedAt.toISOString(),
    comments: cached.comments.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      createdAt: c.createdAt?.toISOString() ?? null,
    })),
    aiScore: toAiScore(cached.aiScore),
    aiDecision: toAiDecision(cached.aiScore?.decisions),
    releaseTasks: toReleaseTasks(cached.releaseTasks),
    staleSnapshots: toStale(cached.staleSnapshots),
  };
}

function toAiScore(
  a: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: Date;
  } | null | undefined
) {
  if (!a) return null;
  return {
    points: a.points,
    confidence: a.confidence,
    reasoning: a.reasoning,
    risks: a.risks,
    missingInformation: a.missingInformation,
    similarTasks: a.similarTasks,
    model: a.model,
    promptVersion: a.promptVersion,
    scoredAt: a.scoredAt.toISOString(),
  };
}

function toAiDecision(
  d: { decision: string; finalPoints: number | null; decidedAt: Date }[] | undefined
) {
  const latest = d?.[0];
  if (!latest) return null;
  return {
    decision: latest.decision,
    finalPoints: latest.finalPoints,
    decidedAt: latest.decidedAt.toISOString(),
  };
}

function toReleaseTasks(
  r: { release: { id: string; version: string; status: string } }[] | undefined
) {
  return (r ?? []).map((t) => ({ release: { version: t.release.version, status: t.release.status } }));
}

function toStale(s: { ageDays: number; detectedAt: Date; staleReason: string; severity: string; stateAgeDays: number; blockedDays: number }[] | undefined) {
  return (s ?? []).map((x) => ({
    ageDays: x.ageDays,
    detectedAt: x.detectedAt.toISOString(),
    staleReason: x.staleReason,
    severity: x.severity,
    stateAgeDays: x.stateAgeDays,
    blockedDays: x.blockedDays,
  }));
}
