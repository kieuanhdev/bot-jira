import { prisma } from "@/lib/prisma";
import { jiraWith, getSystemJiraAuth } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraProjectList } from "@/lib/env";
import type { JiraVersion } from "@/lib/jira/types";

export interface SyncReleasesOptions {
  userId?: string;
  projectKeys?: string[];
}

export interface SyncReleasesResult {
  syncedProjects: string[];
  totalReleases: number;
  created: number;
  updated: number;
  tasksLinked: number;
  errors: string[];
}

/**
 * Sync Jira Fix Versions into the local Release read model.
 * Each Fix Version becomes a Release row with its tasks linked from IssueCache.
 */
export async function syncReleasesFromJira(
  options: SyncReleasesOptions = {}
): Promise<SyncReleasesResult> {
  const { userId, projectKeys } = options;

  let auth = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
    });
    auth = userJiraAuth(user);
  }
  if (!auth) {
    auth = await getSystemJiraAuth();
  }

  if (!auth) {
    return {
      syncedProjects: [],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: ["Chưa cấu hình tài khoản Jira hợp lệ để đồng bộ bản phát hành."],
    };
  }

  const client = jiraWith(auth);

  let targetProjects = projectKeys && projectKeys.length > 0 ? projectKeys : jiraProjectList;

  // If user has specific board projects configured, prioritize those if no keys were explicitly passed
  if (!projectKeys && userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { boardProjects: true },
    });
    if (user?.boardProjects && user.boardProjects.length > 0) {
      targetProjects = [...new Set([...user.boardProjects, ...targetProjects])];
    }
  }

  const result: SyncReleasesResult = {
    syncedProjects: [],
    totalReleases: 0,
    created: 0,
    updated: 0,
    tasksLinked: 0,
    errors: [],
  };

  for (const projectKey of targetProjects) {
    try {
      const versions: JiraVersion[] = await client.getVersions(projectKey);
      if (!Array.isArray(versions)) continue;

      result.syncedProjects.push(projectKey);

      for (const v of versions) {
        if (!v.id || !v.name) continue;

        const releaseDate = v.releaseDate ? new Date(v.releaseDate) : null;
        const isReleased = Boolean(v.released);
        const isArchived = Boolean(v.archived);
        const now = new Date();

        const existing = await prisma.release.findFirst({
          where: { projectKey, jiraVersionId: v.id },
        });

        let releaseId: string;

        if (existing) {
          const updated = await prisma.release.update({
            where: { id: existing.id },
            data: {
              version: v.name,
              archived: isArchived,
              lastSyncedAt: now,
              ...(v.description !== undefined ? { description: v.description ?? "" } : {}),
              ...(releaseDate ? { releaseDate } : {}),
              status: isReleased ? "released" : "draft",
              releasedAt: isReleased ? (existing.releasedAt ?? releaseDate ?? now) : null,
            },
          });
          releaseId = updated.id;
          result.updated++;
        } else {
          const created = await prisma.release.create({
            data: {
              version: v.name,
              projectKey,
              jiraVersionId: v.id,
              description: v.description ?? "",
              releaseDate,
              archived: isArchived,
              status: isReleased ? "released" : "draft",
              releasedAt: isReleased ? (releaseDate ?? now) : null,
              lastSyncedAt: now,
              createdById: userId ?? null,
            },
          });
          releaseId = created.id;
          result.created++;
        }

        result.totalReleases++;

        // Attach matching issues from IssueCache
        const issues = await prisma.issueCache.findMany({
          where: {
            projectKey,
            deletedAt: null,
            OR: [
              { fixVersionIds: { has: v.id } },
              { fixVersionNames: { has: v.name } },
            ],
          },
          select: { jiraKey: true },
        });

        if (issues.length > 0) {
          const currentKeys = issues.map((i) => i.jiraKey);
          await prisma.releaseTask.createMany({
            data: currentKeys.map((jiraKey) => ({ releaseId, jiraKey })),
            skipDuplicates: true,
          });

          // Clean up any stale release tasks no longer attached in Jira
          await prisma.releaseTask.deleteMany({
            where: {
              releaseId,
              jiraKey: { notIn: currentKeys },
            },
          });

          result.tasksLinked += issues.length;
        } else {
          await prisma.releaseTask.deleteMany({
            where: { releaseId },
          });
        }
      }
    } catch (err) {
      result.errors.push(
        `Dự án ${projectKey}: ${(err as Error).message || String(err)}`
      );
    }
  }

  return result;
}
