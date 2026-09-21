import { prisma } from "@/lib/prisma";
import { jira, parseJiraDate } from "@/lib/jira/client";
import { buildProjectPollJql } from "@/lib/jira/jql";
import { upsertJiraCommentsWithNew, upsertJiraIssue } from "@/lib/issues/cache";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { jiraProjectList } from "@/lib/env";
import { guard, hasJiraConfig, env } from "../guard";
import type { WorkerLog } from "../guard";

const MAX_PAGES = 150;
const PAGE_SIZE = 50;

export type PollJiraJobData = {
  projectKey?: string;
  full?: boolean;
  requestedBy?: string;
};

type ProjectStats = {
  projectKey: string;
  created: number;
  updated: number;
  comments: number;
  deleted: number;
  pages: number;
  cursor: string | null;
  errors: string[];
};

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

async function syncProject(projectKey: string, full: boolean): Promise<ProjectStats> {
  const startedAt = new Date();
  const current = await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: "jira", scope: projectKey } },
    create: { integration: "jira", scope: projectKey, lastStartedAt: startedAt },
    update: { lastStartedAt: startedAt, lastError: null },
  });

  const parsedCursor = current.cursor ? new Date(current.cursor) : null;
  const validCursor = parsedCursor && !Number.isNaN(parsedCursor.getTime()) ? parsedCursor : null;
  const since = !full && validCursor
    ? new Date(validCursor.getTime() - env.jiraSyncOverlapSeconds * 1000)
    : undefined;
  const jql = buildProjectPollJql(projectKey, since);
  const stats: ProjectStats = {
    projectKey,
    created: 0,
    updated: 0,
    comments: 0,
    deleted: 0,
    pages: 0,
    cursor: current.cursor,
    errors: [],
  };
  let newestUpdatedAt = validCursor;
  let exhaustedAllPages = false;
  const seenKeys = new Set<string>();
  const isFullScan = full || !validCursor;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await jira.search(jql, PAGE_SIZE, page * PAGE_SIZE);
      stats.pages++;

      for (const issue of result.issues) {
        seenKeys.add(issue.key);
        try {
          const exists = await prisma.issueCache.findUnique({
            where: { jiraKey: issue.key },
            select: { jiraKey: true },
          });
          await upsertJiraIssue(issue);
          if (exists) stats.updated++;
          else stats.created++;

          const issueUpdatedAt = parseJiraDate(issue.fields.updated);
          if (issueUpdatedAt && (!newestUpdatedAt || issueUpdatedAt > newestUpdatedAt)) {
            newestUpdatedAt = issueUpdatedAt;
          }

          try {
            const { synced, newComments } = await upsertJiraCommentsWithNew(
              issue.key,
              await jira.getComments(issue.key)
            );
            stats.comments += synced;
            for (const nc of newComments) {
              await notifyWatchersOfComment(nc.jiraKey, nc.author, nc.body, nc.id).catch(() => null);
            }
          } catch (error) {
            stats.errors.push(`${issue.key} comments: ${safeError(error)}`);
          }
        } catch (error) {
          stats.errors.push(`${issue.key}: ${safeError(error)}`);
        }
      }

      if (result.issues.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= result.total) {
        exhaustedAllPages = true;
        break;
      }
    }

    if (!exhaustedAllPages) {
      throw new Error(`Jira sync exceeded ${MAX_PAGES * PAGE_SIZE} issues for ${projectKey}; cursor was not advanced`);
    }

    // A partial issue/comment failure must not move beyond that item. Re-run
    // from the previous cursor; all writes above are idempotent.
    const cursor = stats.errors.length === 0
      ? (newestUpdatedAt?.toISOString() ?? current.cursor)
      : current.cursor;
    stats.cursor = cursor;
    if (isFullScan && stats.errors.length === 0) {
      const deleted = await prisma.issueCache.updateMany({
        where: {
          projectKey,
          deletedAt: null,
          ...(seenKeys.size > 0 ? { jiraKey: { notIn: [...seenKeys] } } : {}),
        },
        data: { deletedAt: new Date() },
      });
      stats.deleted = deleted.count;
    }
    await prisma.integrationCursor.update({
      where: { id: current.id },
      data: {
        cursor,
        lastSuccessAt: new Date(),
        lastErrorAt: stats.errors.length ? new Date() : null,
        lastError: stats.errors.length ? stats.errors.slice(0, 10).join("; ").slice(0, 2000) : null,
        stats,
      },
    });
    return stats;
  } catch (error) {
    const message = safeError(error);
    await prisma.integrationCursor.update({
      where: { id: current.id },
      data: { lastErrorAt: new Date(), lastError: message, stats },
    });
    throw error;
  }
}

export async function runPollJira(data: PollJiraJobData = {}): Promise<WorkerLog> {
  if (!hasJiraConfig()) return guard(false, "Jira service account not configured");

  const requestedProject = data.projectKey?.trim().toUpperCase();
  const projects = requestedProject
    ? jiraProjectList.filter((key) => key === requestedProject)
    : jiraProjectList;
  if (projects.length === 0) {
    return { ok: false, errors: [requestedProject ? `Unknown Jira project: ${requestedProject}` : "No Jira projects configured"] };
  }

  const results: ProjectStats[] = [];
  const errors: string[] = [];
  for (const projectKey of projects) {
    try {
      results.push(await syncProject(projectKey, Boolean(data.full)));
    } catch (error) {
      errors.push(`${projectKey}: ${safeError(error)}`);
    }
  }

  const stats = results.reduce(
    (total, item) => ({
      projects: total.projects + 1,
      created: total.created + item.created,
      updated: total.updated + item.updated,
      comments: total.comments + item.comments,
      deleted: total.deleted + item.deleted,
      issueErrors: total.issueErrors + item.errors.length,
    }),
    { projects: 0, created: 0, updated: 0, comments: 0, deleted: 0, issueErrors: 0 }
  );
  return { ok: errors.length === 0, stats, errors: [...errors, ...results.flatMap((r) => r.errors)] };
}
