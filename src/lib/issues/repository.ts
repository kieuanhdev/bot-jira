import type { IssueCache, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NormalizedIssueLink } from "@/lib/jira/issue-links";
import type {
  JiraCommentCacheData,
  mapJiraIssueToCacheData,
} from "@/lib/issues/mapping";

export type IssueCacheWriteData = ReturnType<typeof mapJiraIssueToCacheData>;

export type NewComment = {
  id: string;
  jiraKey: string;
  author: string;
  body: string;
};

export type CommentPersistenceOptions = {
  reconcileLegacy: boolean;
  collectNew: boolean;
};

export type CommentPersistenceResult = {
  synced: number;
  newComments: NewComment[];
};

type IssueLinkClient = Pick<PrismaClient, "issueLinkCache">;

export interface IssueRepository {
  findIssueByKey(jiraKey: string): Promise<IssueCache | null>;
  persistIssue(input: {
    jiraKey: string;
    data: IssueCacheWriteData;
    links?: NormalizedIssueLink[];
  }): Promise<{ applied: boolean; data: IssueCacheWriteData }>;
  syncIssueLinks(
    issueKey: string,
    links: NormalizedIssueLink[],
    tx?: IssueLinkClient
  ): Promise<number>;
  persistComments(
    comments: JiraCommentCacheData[],
    options: CommentPersistenceOptions
  ): Promise<CommentPersistenceResult>;
}

/** Detect Prisma P2002 (unique constraint violation) without coupling to an error class. */
export function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code: string }).code === "P2002";
  }
  if (error instanceof Error) {
    return error.message.includes("P2002") || error.message.includes("Unique constraint");
  }
  return false;
}

function issueUpdateWhere(jiraKey: string, updatedAt: Date | null) {
  return {
    jiraKey,
    OR: [
      { updatedAt: null },
      ...(updatedAt ? [{ updatedAt: { lte: updatedAt } }] : []),
    ],
  };
}

function commentUpdateWhere(jiraCommentId: string, updatedAt: Date | null) {
  return {
    jiraCommentId,
    OR: [
      { updatedAt: null },
      ...(updatedAt ? [{ updatedAt: { lte: updatedAt } }] : []),
    ],
  };
}

async function syncIssueLinks(
  issueKey: string,
  links: NormalizedIssueLink[],
  tx?: IssueLinkClient
): Promise<number> {
  const db = tx ?? prisma;
  const key = issueKey.trim().toUpperCase();
  const activeLinkIds: string[] = [];

  for (const link of links) {
    activeLinkIds.push(link.jiraLinkId);
    await db.issueLinkCache.upsert({
      where: { jiraLinkId: link.jiraLinkId },
      create: {
        ...link,
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

  return links.length;
}

async function persistIssue(input: {
  jiraKey: string;
  data: IssueCacheWriteData;
  links?: NormalizedIssueLink[];
}): Promise<{ applied: boolean; data: IssueCacheWriteData }> {
  const { jiraKey, data, links } = input;
  const incomingUpdatedAt = data.updatedAt;

  return prisma.$transaction(async (tx) => {
    const updateRes = await tx.issueCache.updateMany({
      where: issueUpdateWhere(jiraKey, incomingUpdatedAt),
      data,
    });

    if (updateRes.count > 0) {
      if (links) await syncIssueLinks(jiraKey, links, tx);
      return { applied: true, data };
    }

    const existing = await tx.issueCache.findUnique({
      where: { jiraKey },
      select: { updatedAt: true },
    });
    if (existing) return { applied: false, data };

    try {
      await tx.issueCache.create({
        data: { jiraKey, ...data },
      });
      if (links) await syncIssueLinks(jiraKey, links, tx);
      return { applied: true, data };
    } catch (createError) {
      if (!isPrismaUniqueConstraintError(createError)) throw createError;

      const retryRes = await tx.issueCache.updateMany({
        where: issueUpdateWhere(jiraKey, incomingUpdatedAt),
        data,
      });
      const applied = retryRes.count > 0;
      if (applied && links) await syncIssueLinks(jiraKey, links, tx);
      return { applied, data };
    }
  });
}

async function reconcileLegacyComment(comment: JiraCommentCacheData): Promise<boolean> {
  const legacy = await prisma.commentCache.findFirst({
    where: {
      jiraCommentId: null,
      jiraKey: comment.jiraKey,
      author: comment.author,
      body: comment.body,
    },
    select: { id: true },
  });
  if (!legacy) return false;

  await prisma.commentCache.update({
    where: { id: legacy.id },
    data: {
      jiraCommentId: comment.jiraCommentId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      syncedAt: new Date(),
    },
  });
  return true;
}

async function retryCommentCreateRace(comment: JiraCommentCacheData): Promise<boolean> {
  const raceRow = await prisma.commentCache.findUnique({
    where: { jiraCommentId: comment.jiraCommentId },
    select: { id: true, updatedAt: true },
  });
  if (!raceRow) return false;

  const storedUpdatedAt = raceRow.updatedAt;
  if (storedUpdatedAt && (!comment.updatedAt || comment.updatedAt < storedUpdatedAt)) {
    return false;
  }

  const retryRes = await prisma.commentCache.updateMany({
    where: commentUpdateWhere(comment.jiraCommentId, comment.updatedAt),
    data: {
      jiraKey: comment.jiraKey,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      syncedAt: new Date(),
    },
  });
  return retryRes.count > 0;
}

async function persistComments(
  comments: JiraCommentCacheData[],
  options: CommentPersistenceOptions
): Promise<CommentPersistenceResult> {
  let synced = 0;
  const newComments: NewComment[] = [];

  for (const comment of comments) {
    if (options.reconcileLegacy && await reconcileLegacyComment(comment)) {
      synced++;
      continue;
    }

    const writeData = {
      jiraKey: comment.jiraKey,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      syncedAt: new Date(),
    };
    const updateRes = await prisma.commentCache.updateMany({
      where: commentUpdateWhere(comment.jiraCommentId, comment.updatedAt),
      data: writeData,
    });
    if (updateRes.count > 0) {
      synced++;
      continue;
    }

    const existing = await prisma.commentCache.findUnique({
      where: { jiraCommentId: comment.jiraCommentId },
      select: { id: true },
    });
    if (existing) continue;

    try {
      await prisma.commentCache.create({
        data: {
          jiraCommentId: comment.jiraCommentId,
          ...writeData,
        },
      });
      synced++;
      if (options.collectNew) {
        newComments.push({
          id: comment.jiraCommentId,
          jiraKey: comment.jiraKey,
          author: comment.author,
          body: comment.body,
        });
      }
    } catch (createError) {
      if (!isPrismaUniqueConstraintError(createError)) throw createError;
      if (await retryCommentCreateRace(comment)) synced++;
    }
  }

  return { synced, newComments };
}

export const issueRepository: IssueRepository = {
  findIssueByKey(jiraKey) {
    return prisma.issueCache.findUnique({ where: { jiraKey } });
  },
  persistIssue,
  syncIssueLinks,
  persistComments,
};
