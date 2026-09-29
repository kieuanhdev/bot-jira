import { prisma } from "@/lib/prisma";
import { jira, parseJiraDate } from "@/lib/jira/client";
import { buildProjectPollJql } from "@/lib/jira/jql";
import { upsertJiraCommentsWithNew, upsertJiraIssue } from "@/lib/issues/cache";
import {
  notifyWatchersOfComment,
  notifyWatchersOfIssueChange,
} from "@/lib/issues/notify-watchers";
import { jiraProjectList } from "@/lib/env";
import { guard, hasJiraConfig, env } from "../guard";
import type { WorkerLog } from "../guard";

const MAX_PAGES = 150;
const PAGE_SIZE = 50;

export type JiraSyncSource = "schedule" | "manual" | "startup" | "admin";

export type PollJiraProjectJobData = {
  projectKey: string;
  full: boolean;
  source: JiraSyncSource;
  requestedBy?: string;
  requestedAt: string;
};

export type PollJiraJobData = {
  projectKey?: string;
  full?: boolean;
  requestedBy?: string;
  source?: JiraSyncSource;
  requestedAt?: string;
};

export type ProjectStats = {
  projectKey: string;
  created: number;
  updated: number;
  comments: number;
  deleted: number;
  pages: number;
  cursor: string | null;
  errors: string[];
  cursorAdvanced?: boolean;
};

export function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

export async function syncProject(projectKey: string, full: boolean): Promise<ProjectStats> {
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
    cursorAdvanced: false,
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
          const previous = await prisma.issueCache.findUnique({
            where: { jiraKey: issue.key },
          });
          const currentIssue = await upsertJiraIssue(issue);
          if (previous) stats.updated++;
          else stats.created++;

          await notifyWatchersOfIssueChange(previous, {
            jiraKey: issue.key,
            ...currentIssue,
          }).catch(() => null);

          const issueUpdatedAt = parseJiraDate(issue.fields.updated);
          if (issueUpdatedAt && (!newestUpdatedAt || issueUpdatedAt > newestUpdatedAt)) {
            newestUpdatedAt = issueUpdatedAt;
          }

          try {
            const commentData = issue.fields.comment as { total?: number; comments?: import("@/lib/jira/types").JiraComment[] } | undefined;
            const availableComments = commentData?.comments ?? [];
            const totalComments = commentData?.total ?? availableComments.length;

            let commentsToSync: import("@/lib/jira/types").JiraComment[] = [];
            if (availableComments.length > 0 && totalComments <= availableComments.length) {
              commentsToSync = availableComments;
            } else if (totalComments > 0) {
              commentsToSync = await jira.getComments(issue.key);
            }

            if (commentsToSync.length > 0) {
              const { synced, newComments } = await upsertJiraCommentsWithNew(
                issue.key,
                commentsToSync
              );
              stats.comments += synced;
              for (const nc of newComments) {
                await notifyWatchersOfComment(nc.jiraKey, nc.author, nc.body, nc.id).catch(() => null);
              }
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

    // Ensure newestUpdatedAt does not regress before validCursor
    if (validCursor && newestUpdatedAt && newestUpdatedAt < validCursor) {
      newestUpdatedAt = validCursor;
    }

    // Advance cursor only if no item errors occurred and all pages were read
    const cursor = stats.errors.length === 0
      ? (newestUpdatedAt?.toISOString() ?? current.cursor)
      : current.cursor;
    const cursorAdvanced = stats.errors.length === 0 && Boolean(cursor && cursor !== current.cursor);
    stats.cursor = cursor;
    stats.cursorAdvanced = cursorAdvanced;

    // Full scan soft-delete only when all pages succeeded with 0 errors
    if (isFullScan && stats.errors.length === 0 && exhaustedAllPages) {
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
        lastSuccessAt: stats.errors.length === 0 ? new Date() : current.lastSuccessAt,
        lastErrorAt: stats.errors.length ? new Date() : null,
        lastError: stats.errors.length ? stats.errors.slice(0, 10).join("; ").slice(0, 2000) : null,
        stats: {
          ...stats,
          cursorAdvanced,
        },
      },
    });
    return stats;
  } catch (error) {
    const message = safeError(error);
    await prisma.integrationCursor.update({
      where: { id: current.id },
      data: { lastErrorAt: new Date(), lastError: message, stats },
    }).catch(() => null);
    throw error;
  }
}

export async function runPollJiraProject(data: PollJiraProjectJobData): Promise<WorkerLog> {
  const { getSystemJiraAuth } = await import("@/lib/jira/client");
  const auth = await getSystemJiraAuth();
  if (!auth) return guard(false, "Jira not configured in env or user settings");

  const projectKey = data.projectKey?.trim().toUpperCase();
  if (!projectKey) {
    return { ok: false, errors: ["Missing or invalid projectKey"] };
  }

  const requestedAtMs = data.requestedAt ? new Date(data.requestedAt).getTime() : Date.now();
  const queueLagMs = Math.max(0, Date.now() - (Number.isNaN(requestedAtMs) ? Date.now() : requestedAtMs));
  const startedAt = Date.now();

  try {
    const stats = await syncProject(projectKey, Boolean(data.full));
    const durationMs = Date.now() - startedAt;
    const ok = stats.errors.length === 0;

    console.info(
      JSON.stringify({
        level: ok ? "info" : "warn",
        job: "poll-jira-project",
        projectKey,
        source: data.source,
        requestedBy: data.requestedBy ?? null,
        queueLagMs,
        durationMs,
        pages: stats.pages,
        created: stats.created,
        updated: stats.updated,
        comments: stats.comments,
        deleted: stats.deleted,
        issueErrors: stats.errors.length,
        cursorAdvanced: Boolean(stats.cursorAdvanced),
        ok,
      })
    );

    return {
      ok,
      stats: {
        ...stats,
        queueLagMs,
        durationMs,
        source: data.source,
        requestedBy: data.requestedBy ?? null,
        ok,
      },
      ...(stats.errors.length > 0 ? { errors: stats.errors } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = safeError(error);
    console.error(
      JSON.stringify({
        level: "error",
        job: "poll-jira-project",
        projectKey,
        source: data.source,
        queueLagMs,
        durationMs,
        error: errorMsg,
      })
    );
    return {
      ok: false,
      errors: [errorMsg],
      stats: {
        projectKey,
        durationMs,
        queueLagMs,
        source: data.source,
        ok: false,
      },
    };
  }
}

/** Legacy all-project / single-project backward compatibility entrypoint. */
export async function runPollJira(data: PollJiraJobData = {}): Promise<WorkerLog> {
  if (data.projectKey) {
    return runPollJiraProject({
      projectKey: data.projectKey,
      full: Boolean(data.full),
      source: data.source ?? (data.requestedBy ? "manual" : "schedule"),
      requestedBy: data.requestedBy,
      requestedAt: data.requestedAt ?? new Date().toISOString(),
    });
  }

  const { getSystemJiraAuth } = await import("@/lib/jira/client");
  const auth = await getSystemJiraAuth();
  if (!auth) return guard(false, "Jira not configured in env or user settings");

  const projects = jiraProjectList;
  if (projects.length === 0) {
    return { ok: false, errors: ["No Jira projects configured"] };
  }

  const results: ProjectStats[] = [];
  const errors: string[] = [];
  for (const key of projects) {
    try {
      results.push(await syncProject(key, Boolean(data.full)));
    } catch (error) {
      errors.push(`${key}: ${safeError(error)}`);
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
  const allErrors = [...errors, ...results.flatMap((r) => r.errors)];
  const totalProjects = projects.length;
  const failedProjects = errors.length;
  const allFailed = failedProjects >= totalProjects;

  if (allFailed) {
    return { ok: false, stats: { ...stats, failedProjects, totalProjects }, errors: allErrors };
  }

  return {
    ok: true,
    stats: { ...stats, failedProjects, totalProjects },
    ...(allErrors.length > 0 ? { errors: allErrors } : {}),
  };
}
