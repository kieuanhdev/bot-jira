import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jiraPointsFromFields, parseJiraDate } from "@/lib/jira/client";
import type { JiraComment, JiraIssue } from "@/lib/jira/types";
import { jiraIssueFields } from "@/lib/jira/client";
import { notifyWatchersOfIssueChange } from "@/lib/issues/notify-watchers";

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
  const { points, fieldId: storyField } = jiraPointsFromFields(f);
  const fixVersions = f.fixVersions ?? [];

  return {
    projectKey: f.project?.key ?? issue.key.split("-")[0] ?? "",
    summary: f.summary ?? "",
    description: descriptionText(f.description),
    status: f.status?.name ?? "",
    statusId: f.status?.id ?? null,
    statusCategory: f.status?.statusCategory?.key?.toLowerCase() ?? "unknown",
    statusChangedAt: parseJiraDate(f.statuscategorychangedate) ?? null,
    assigneeJira: f.assignee?.name ?? null,
    labels: f.labels ?? [],
    fixVersionIds: fixVersions.flatMap((v) => (v.id ? [v.id] : [])),
    fixVersionNames: fixVersions.flatMap((v) => (v.name ? [v.name] : [])),
    priority: f.priority?.name ?? "",
    points,
    storyField,
    type: f.issuetype?.name ?? "",
    dueDate: parseJiraDate(f.duedate as string | undefined) ?? null,
    timeSpent: typeof f.timespent === "number" ? f.timespent : null,
    originalEstimateSeconds:
      typeof f.timeoriginalestimate === "number" && Number.isFinite(f.timeoriginalestimate)
        ? Math.round(f.timeoriginalestimate)
        : f.timetracking &&
          typeof (f.timetracking as Record<string, unknown>).originalEstimateSeconds === "number" &&
          Number.isFinite((f.timetracking as Record<string, unknown>).originalEstimateSeconds)
        ? Math.round((f.timetracking as Record<string, unknown>).originalEstimateSeconds as number)
        : typeof f.timeoriginalestimate === "string" &&
          f.timeoriginalestimate.trim() !== "" &&
          !isNaN(Number(f.timeoriginalestimate))
        ? Math.round(Number(f.timeoriginalestimate))
        : null,
    createdAt: parseJiraDate(f.created) ?? null,
    updatedAt: parseJiraDate(f.updated) ?? null,
    lastSyncedAt: new Date(),
    deletedAt: null,
    raw: JSON.parse(JSON.stringify(f)) as Prisma.InputJsonValue,
  };
}

/**
 * Prisma transaction client type. Accepts either the global PrismaClient
 * or a transaction client ($transaction callback parameter).
 */
type TxClient = Pick<PrismaClient, "issueLinkCache">;

/**
 * Synchronise issue links for an issue key.
 *
 * Accepts an optional Prisma transaction client so that link writes
 * are part of the same transaction as the issue upsert (PR 2).
 * When called without a tx client, uses the global prisma instance.
 */
export async function syncIssueLinks(
  issueKey: string,
  rawLinks?: JiraIssue["fields"]["issuelinks"],
  tx?: TxClient
): Promise<number> {
  if (!Array.isArray(rawLinks)) {
    return 0;
  }

  const db = tx ?? prisma;
  const { normalizeIssueLink } = await import("@/lib/jira/issue-links");
  const key = issueKey.trim().toUpperCase();
  const normalizedLinks = rawLinks
    .map((l) => normalizeIssueLink(key, l))
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const activeLinkIds: string[] = [];

  for (const link of normalizedLinks) {
    activeLinkIds.push(link.jiraLinkId);
    await db.issueLinkCache.upsert({
      where: { jiraLinkId: link.jiraLinkId },
      create: {
        jiraLinkId: link.jiraLinkId,
        linkTypeId: link.linkTypeId,
        linkTypeName: link.linkTypeName,
        inwardLabel: link.inwardLabel,
        outwardLabel: link.outwardLabel,
        outwardKey: link.outwardKey,
        inwardKey: link.inwardKey,
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
      update: {
        linkTypeId: link.linkTypeId,
        linkTypeName: link.linkTypeName,
        inwardLabel: link.inwardLabel,
        outwardLabel: link.outwardLabel,
        outwardKey: link.outwardKey,
        inwardKey: link.inwardKey,
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
    });
  }

  // Soft-delete links for this issue that are no longer present in Jira's active response
  await db.issueLinkCache.updateMany({
    where: {
      OR: [{ inwardKey: key }, { outwardKey: key }],
      deletedAt: null,
      jiraLinkId: { notIn: activeLinkIds },
    },
    data: {
      deletedAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });

  return normalizedLinks.length;
}

/**
 * Upsert a Jira issue with conditional version check.
 *
 * When the payload is applied, issue links are synced within the same
 * database transaction so that issue + links always belong to the same
 * Jira version (T). Link sync errors roll back the issue update too,
 * allowing consistent retry on the next sync cycle.
 *
 * When the payload is stale (existing row is newer), links are NOT touched.
 */
export async function upsertJiraIssue(
  issue: JiraIssue
): Promise<{ applied: boolean; data: ReturnType<typeof issueCacheData> }> {
  const data = issueCacheData(issue);
  const incomingUpdatedAt = data.updatedAt;
  const hasLinks = Array.isArray(issue.fields.issuelinks);

  // Wrap the entire issue + link write in a transaction.
  // If link sync fails, the issue update is rolled back so the next
  // sync attempt can retry with consistent data.
  return prisma.$transaction(async (tx) => {
    // Conditional update: only update if stored updatedAt is null or <= incoming.updatedAt
    const updateRes = await tx.issueCache.updateMany({
      where: {
        jiraKey: issue.key,
        OR: [
          { updatedAt: null },
          ...(incomingUpdatedAt ? [{ updatedAt: { lte: incomingUpdatedAt } }] : []),
        ],
      },
      data,
    });

    if (updateRes.count > 0) {
      // Payload applied — sync links in the same transaction.
      // No .catch(() => null): link errors MUST roll back the issue update.
      if (hasLinks) {
        await syncIssueLinks(issue.key, issue.fields.issuelinks, tx);
      }
      return { applied: true, data };
    }

    // Count === 0: either the issue exists but stored is newer, OR it does not exist yet.
    const existing = await tx.issueCache.findUnique({
      where: { jiraKey: issue.key },
      select: { updatedAt: true },
    });

    if (existing) {
      // Existing record is newer than incoming payload -> reject stale payload.
      // Do not sync issue links and do not notify.
      return { applied: false, data };
    }

    // Record does not exist: create it. Handle potential create race using jiraKey.
    try {
      await tx.issueCache.create({
        data: { jiraKey: issue.key, ...data },
      });
      // Sync links inside the same transaction
      if (hasLinks) {
        await syncIssueLinks(issue.key, issue.fields.issuelinks, tx);
      }
      return { applied: true, data };
    } catch (createError) {
      // Check if this is a P2002 unique constraint error (create race).
      // If so, retry conditional update. Other errors must propagate.
      if (!isPrismaUniqueConstraintError(createError)) {
        throw createError;
      }

      // Unique constraint race: another worker created it concurrently.
      // Retry conditional update once.
      const retryRes = await tx.issueCache.updateMany({
        where: {
          jiraKey: issue.key,
          OR: [
            { updatedAt: null },
            ...(incomingUpdatedAt ? [{ updatedAt: { lte: incomingUpdatedAt } }] : []),
          ],
        },
        data,
      });

      const applied = retryRes.count > 0;
      if (applied && hasLinks) {
        await syncIssueLinks(issue.key, issue.fields.issuelinks, tx);
      }
      return { applied, data };
    }
  });
}

/**
 * Detect Prisma P2002 (unique constraint violation) errors.
 */
export function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code: string }).code === "P2002";
  }
  // Fallback: check message for P2002 pattern
  if (error instanceof Error) {
    return error.message.includes("P2002") || error.message.includes("Unique constraint");
  }
  return false;
}

export async function refreshJiraIssueCache(
  client: { getIssue: (key: string, fields?: string) => Promise<JiraIssue> },
  key: string,
  options: { authorName?: string | null; excludeUserId?: string | null } = {}
): Promise<boolean> {
  try {
    const previous = await prisma.issueCache.findUnique({ where: { jiraKey: key } });
    const { applied, data: current } = await upsertJiraIssue(await client.getIssue(key, jiraIssueFields()));
    if (applied) {
      await notifyWatchersOfIssueChange(previous, { jiraKey: key, ...current }, options)
        .catch(() => null);
    }
    return applied;
  } catch {
    return false;
  }
}

export async function upsertJiraComments(jiraKey: string, comments: JiraComment[]): Promise<number> {
  let synced = 0;
  for (const comment of comments) {
    const body = descriptionText(comment.body).trim();
    if (!body || !comment.id) continue;
    const author = comment.author?.displayName || comment.author?.name || "unknown";
    const incomingCreatedAt = parseJiraDate(comment.created) ?? null;
    const incomingUpdatedAt = parseJiraDate(comment.updated) ?? null;

    const legacy = await prisma.commentCache.findFirst({
      where: {
        jiraCommentId: null,
        jiraKey,
        author,
        body,
      },
      select: { id: true },
    });
    if (legacy) {
      await prisma.commentCache.update({
        where: { id: legacy.id },
        data: {
          jiraCommentId: comment.id,
          createdAt: incomingCreatedAt,
          updatedAt: incomingUpdatedAt,
          syncedAt: new Date(),
        },
      });
      synced++;
      continue;
    }

    // Conditional update: only update if stored updatedAt is null or <= incoming.updatedAt
    const updateRes = await prisma.commentCache.updateMany({
      where: {
        jiraCommentId: comment.id,
        OR: [
          { updatedAt: null },
          ...(incomingUpdatedAt ? [{ updatedAt: { lte: incomingUpdatedAt } }] : []),
        ],
      },
      data: {
        jiraKey,
        author,
        body,
        createdAt: incomingCreatedAt,
        updatedAt: incomingUpdatedAt,
        syncedAt: new Date(),
      },
    });

    if (updateRes.count > 0) {
      synced++;
      continue;
    }

    const existing = await prisma.commentCache.findUnique({
      where: { jiraCommentId: comment.id },
      select: { id: true },
    });

    if (existing) {
      // Stored comment is newer; skip updating body with stale payload
      continue;
    }

    try {
      await prisma.commentCache.create({
        data: {
          jiraCommentId: comment.id,
          jiraKey,
          author,
          body,
          createdAt: incomingCreatedAt,
          updatedAt: incomingUpdatedAt,
          syncedAt: new Date(),
        },
      });
      synced++;
    } catch (createError) {
      if (!isPrismaUniqueConstraintError(createError)) {
        // Not a race — rethrow timeout, connection error, FK error, etc.
        throw createError;
      }
      // P2002 create race: another worker created it concurrently.
      // Read back the row and retry conditional update if payload is newer.
      const raceRow = await prisma.commentCache.findUnique({
        where: { jiraCommentId: comment.id },
        select: { id: true, updatedAt: true },
      });
      if (raceRow) {
        const raceUpdatedAt = raceRow.updatedAt;
        if (
          !raceUpdatedAt ||
          (incomingUpdatedAt && incomingUpdatedAt >= raceUpdatedAt)
        ) {
          // Payload is newer or equal: retry conditional update
          const retryRes = await prisma.commentCache.updateMany({
            where: {
              jiraCommentId: comment.id,
              OR: [
                { updatedAt: null },
                ...(incomingUpdatedAt
                  ? [{ updatedAt: { lte: incomingUpdatedAt } }]
                  : []),
              ],
            },
            data: {
              jiraKey,
              author,
              body,
              createdAt: incomingCreatedAt,
              updatedAt: incomingUpdatedAt,
              syncedAt: new Date(),
            },
          });
          if (retryRes.count > 0) synced++;
        }
        // else: stored is newer, skip
      }
    }
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

    const author = comment.author?.displayName || comment.author?.name || "unknown";
    const incomingCreatedAt = parseJiraDate(comment.created) ?? null;
    const incomingUpdatedAt = parseJiraDate(comment.updated) ?? null;

    // Conditional update: only update if stored updatedAt is null or <= incoming.updatedAt
    const updateRes = await prisma.commentCache.updateMany({
      where: {
        jiraCommentId: comment.id,
        OR: [
          { updatedAt: null },
          ...(incomingUpdatedAt ? [{ updatedAt: { lte: incomingUpdatedAt } }] : []),
        ],
      },
      data: {
        jiraKey,
        author,
        body,
        createdAt: incomingCreatedAt,
        updatedAt: incomingUpdatedAt,
        syncedAt: new Date(),
      },
    });

    if (updateRes.count > 0) {
      synced++;
      continue;
    }

    const existing = await prisma.commentCache.findUnique({
      where: { jiraCommentId: comment.id },
      select: { id: true },
    });

    if (existing) {
      // Stored comment is newer; skip updating body with stale payload
      continue;
    }

    try {
      await prisma.commentCache.create({
        data: {
          jiraCommentId: comment.id,
          jiraKey,
          author,
          body,
          createdAt: incomingCreatedAt,
          updatedAt: incomingUpdatedAt,
          syncedAt: new Date(),
        },
      });
      synced++;
      newComments.push({ id: comment.id, jiraKey, author, body });
    } catch (createError) {
      if (!isPrismaUniqueConstraintError(createError)) {
        // Not a race — rethrow timeout, connection error, FK error, etc.
        throw createError;
      }
      // P2002 create race: another worker created it concurrently.
      // Read back and retry if payload is newer.
      const raceRow = await prisma.commentCache.findUnique({
        where: { jiraCommentId: comment.id },
        select: { id: true, updatedAt: true },
      });
      if (raceRow) {
        const raceUpdatedAt = raceRow.updatedAt;
        if (
          !raceUpdatedAt ||
          (incomingUpdatedAt && incomingUpdatedAt >= raceUpdatedAt)
        ) {
          const retryRes = await prisma.commentCache.updateMany({
            where: {
              jiraCommentId: comment.id,
              OR: [
                { updatedAt: null },
                ...(incomingUpdatedAt
                  ? [{ updatedAt: { lte: incomingUpdatedAt } }]
                  : []),
              ],
            },
            data: {
              jiraKey,
              author,
              body,
              createdAt: incomingCreatedAt,
              updatedAt: incomingUpdatedAt,
              syncedAt: new Date(),
            },
          });
          if (retryRes.count > 0) synced++;
        }
        // else: stored is newer, skip — not "new" to this instance
      }
    }
  }
  return { synced, newComments };
}
