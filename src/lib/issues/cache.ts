import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { parseJiraDate } from "@/lib/jira/client";
import type { JiraComment, JiraIssue } from "@/lib/jira/types";
import { jiraIssueFields } from "@/lib/jira/client";

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function issueCacheData(issue: JiraIssue) {
  const f = issue.fields;
  const rawPoints = env.jiraPointsFieldId ? f[env.jiraPointsFieldId] : undefined;
  const points =
    rawPoints != null && Number.isFinite(Number(rawPoints)) ? Number(rawPoints) : null;
  const fixVersions = f.fixVersions ?? [];

  return {
    projectKey: f.project?.key ?? issue.key.split("-")[0] ?? "",
    summary: f.summary ?? "",
    description: descriptionText(f.description),
    status: f.status?.name ?? "",
    statusCategory: f.status?.statusCategory?.key?.toLowerCase() ?? "unknown",
    statusChangedAt: parseJiraDate(f.statuscategorychangedate) ?? null,
    assigneeJira: f.assignee?.name ?? null,
    labels: f.labels ?? [],
    fixVersionIds: fixVersions.flatMap((v) => (v.id ? [v.id] : [])),
    fixVersionNames: fixVersions.flatMap((v) => (v.name ? [v.name] : [])),
    priority: f.priority?.name ?? "",
    points,
    type: f.issuetype?.name ?? "",
    createdAt: parseJiraDate(f.created) ?? null,
    updatedAt: parseJiraDate(f.updated) ?? null,
    lastSyncedAt: new Date(),
    deletedAt: null,
    raw: JSON.parse(JSON.stringify(f)) as Prisma.InputJsonValue,
  };
}

export async function upsertJiraIssue(issue: JiraIssue) {
  const data = issueCacheData(issue);
  await prisma.issueCache.upsert({
    where: { jiraKey: issue.key },
    create: { jiraKey: issue.key, ...data },
    update: data,
  });
  return data;
}

export async function refreshJiraIssueCache(
  client: { getIssue: (key: string, fields?: string) => Promise<JiraIssue> },
  key: string
): Promise<boolean> {
  try {
    await upsertJiraIssue(await client.getIssue(key, jiraIssueFields()));
    return true;
  } catch {
    return false;
  }
}

export async function upsertJiraComments(jiraKey: string, comments: JiraComment[]) {
  let synced = 0;
  for (const comment of comments) {
    const body = descriptionText(comment.body).trim();
    if (!body || !comment.id) continue;
    const legacy = await prisma.commentCache.findFirst({
      where: {
        jiraCommentId: null,
        jiraKey,
        author: comment.author?.displayName || comment.author?.name || "unknown",
        body,
      },
      select: { id: true },
    });
    if (legacy) {
      await prisma.commentCache.update({
        where: { id: legacy.id },
        data: {
          jiraCommentId: comment.id,
          createdAt: parseJiraDate(comment.created) ?? null,
          updatedAt: parseJiraDate(comment.updated) ?? null,
          syncedAt: new Date(),
        },
      });
      synced++;
      continue;
    }
    await prisma.commentCache.upsert({
      where: { jiraCommentId: comment.id },
      create: {
        jiraCommentId: comment.id,
        jiraKey,
        author: comment.author?.displayName || comment.author?.name || "unknown",
        body,
        createdAt: parseJiraDate(comment.created) ?? null,
        updatedAt: parseJiraDate(comment.updated) ?? null,
        syncedAt: new Date(),
      },
      update: {
        jiraKey,
        author: comment.author?.displayName || comment.author?.name || "unknown",
        body,
        createdAt: parseJiraDate(comment.created) ?? null,
        updatedAt: parseJiraDate(comment.updated) ?? null,
        syncedAt: new Date(),
      },
    });
    synced++;
  }
  return synced;
}

export type NewComment = {
  id: string;
  jiraKey: string;
  author: string;
  body: string;
};

/**
 * Upsert comments and return only the ones that were newly inserted (not
 * previously in the cache). Used by the poll worker to notify watchers of
 * comments created directly in Jira.
 */
export async function upsertJiraCommentsWithNew(
  jiraKey: string,
  comments: JiraComment[]
): Promise<{ synced: number; newComments: NewComment[] }> {
  let synced = 0;
  const newComments: NewComment[] = [];
  for (const comment of comments) {
    const body = descriptionText(comment.body).trim();
    if (!body || !comment.id) continue;

    const existing = await prisma.commentCache.findUnique({
      where: { jiraCommentId: comment.id },
      select: { id: true },
    });

    const author = comment.author?.displayName || comment.author?.name || "unknown";

    if (existing) {
      await prisma.commentCache.update({
        where: { id: existing.id },
        data: {
          jiraKey,
          author,
          body,
          createdAt: parseJiraDate(comment.created) ?? null,
          updatedAt: parseJiraDate(comment.updated) ?? null,
          syncedAt: new Date(),
        },
      });
      synced++;
      continue;
    }

    await prisma.commentCache.create({
      data: {
        jiraCommentId: comment.id,
        jiraKey,
        author,
        body,
        createdAt: parseJiraDate(comment.created) ?? null,
        updatedAt: parseJiraDate(comment.updated) ?? null,
        syncedAt: new Date(),
      },
    });
    synced++;
    newComments.push({ id: comment.id, jiraKey, author, body });
  }
  return { synced, newComments };
}
