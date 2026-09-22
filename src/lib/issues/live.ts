import { prisma } from "@/lib/prisma";
import { jiraIssueFields, jiraWith, parseJiraDate } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { env } from "@/lib/env";
import type { JiraIssue } from "@/lib/jira/types";
import { upsertJiraComments, upsertJiraIssue } from "@/lib/issues/cache";

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
  priority: string;
  points: number | null;
  type: string;
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
  priority: string;
  points: number | null;
  type: string;
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
    const rawPoints = env.jiraPointsFieldId ? f[env.jiraPointsFieldId] : undefined;
    const points =
      rawPoints != null && Number.isFinite(Number(rawPoints)) ? Number(rawPoints) : null;
    return {
      rawIssue: issueRes,
      summary: f.summary ?? "",
      description: f.description ?? "",
      status: f.status?.name ?? "",
      assigneeJira: f.assignee?.name ?? null,
      labels: f.labels ?? [],
      priority: f.priority?.name ?? "",
      points,
      type: f.issuetype?.name ?? "",
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
    await upsertJiraIssue(live.rawIssue).catch(() => null);
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
      priority: live.priority,
      points: live.points,
      type: live.type,
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
    priority: cached.priority,
    points: cached.points,
    type: cached.type,
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
