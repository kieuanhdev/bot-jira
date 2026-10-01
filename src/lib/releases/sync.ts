import { prisma } from "@/lib/prisma";
import { jiraWith, getSystemJiraAuth, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { listSyncEnabledProjectKeys, normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { JiraVersion } from "@/lib/jira/types";

export const JIRA_RELEASES_INTEGRATION = "jira-releases";

export type ProjectReleaseSyncState = "synced" | "empty" | "forbidden" | "auth_required" | "failed";

export type ProjectReleaseSyncResult = {
  projectKey: string;
  state: ProjectReleaseSyncState;
  versionCount: number;
  created: number;
  updated: number;
  tasksLinked: number;
  errorCode: string | null;
  errorMessage: string | null;
};

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
  projects: ProjectReleaseSyncResult[];
}

async function recordReleaseCursor(
  projectKey: string,
  data: {
    lastStartedAt?: Date;
    lastSuccessAt?: Date | null;
    lastErrorAt?: Date | null;
    lastError?: string | null;
    stats?: {
      state: ProjectReleaseSyncState;
      versionCount: number;
      created: number;
      updated: number;
      tasksLinked: number;
      errorCode: string | null;
    };
  }
) {
  try {
    await prisma.integrationCursor.upsert({
      where: {
        integration_scope: {
          integration: JIRA_RELEASES_INTEGRATION,
          scope: projectKey,
        },
      },
      create: {
        integration: JIRA_RELEASES_INTEGRATION,
        scope: projectKey,
        lastStartedAt: data.lastStartedAt ?? new Date(),
        lastSuccessAt: data.lastSuccessAt ?? null,
        lastErrorAt: data.lastErrorAt ?? null,
        lastError: data.lastError ?? null,
        stats: data.stats ?? undefined,
      },
      update: {
        ...(data.lastStartedAt ? { lastStartedAt: data.lastStartedAt } : {}),
        ...(data.lastSuccessAt !== undefined ? { lastSuccessAt: data.lastSuccessAt } : {}),
        ...(data.lastErrorAt !== undefined ? { lastErrorAt: data.lastErrorAt } : {}),
        ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
        ...(data.stats !== undefined ? { stats: data.stats } : {}),
      },
    });
  } catch (e) {
    console.error(`Failed to update integration cursor for ${projectKey}:`, e);
  }
}

function classifyJiraError(err: unknown): { state: ProjectReleaseSyncState; errorCode: string; message: string } {
  const msg = (err as Error)?.message || String(err);
  if (err instanceof JiraRequestError) {
    if (err.status === 401) {
      return { state: "auth_required", errorCode: "jira_auth_failed", message: msg };
    }
    if (err.status === 403) {
      return { state: "forbidden", errorCode: "jira_forbidden", message: msg };
    }
    if (err.status === 404) {
      return { state: "failed", errorCode: "project_not_found", message: msg };
    }
    return { state: "failed", errorCode: "jira_unavailable", message: msg };
  }

  const lower = msg.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token")) {
    return { state: "auth_required", errorCode: "jira_auth_failed", message: msg };
  }
  if (lower.includes("403") || lower.includes("forbidden") || lower.includes("permission")) {
    return { state: "forbidden", errorCode: "jira_forbidden", message: msg };
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return { state: "failed", errorCode: "project_not_found", message: msg };
  }
  return { state: "failed", errorCode: "jira_unavailable", message: msg };
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

  let rawProjects = projectKeys && projectKeys.length > 0 ? projectKeys : await listSyncEnabledProjectKeys();

  // If user has specific board projects configured, prioritize those if no keys were explicitly passed
  if (!projectKeys && userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { boardProjects: true },
    });
    if (user?.boardProjects && user.boardProjects.length > 0) {
      rawProjects = [...new Set([...user.boardProjects, ...rawProjects])];
    }
  }

  const targetProjects = rawProjects.map(normalizeProjectKey).filter(Boolean);

  if (!auth) {
    const errorMsg = "Chưa cấu hình tài khoản Jira hợp lệ để đồng bộ bản phát hành.";
    const projectResults: ProjectReleaseSyncResult[] = targetProjects.map((pk) => ({
      projectKey: pk,
      state: "auth_required",
      versionCount: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errorCode: "jira_credentials_required",
      errorMessage: errorMsg,
    }));

    for (const pk of targetProjects) {
      await recordReleaseCursor(pk, {
        lastStartedAt: new Date(),
        lastErrorAt: new Date(),
        lastError: errorMsg,
        stats: {
          state: "auth_required",
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
          errorCode: "jira_credentials_required",
        },
      });
    }

    return {
      syncedProjects: [],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: [errorMsg],
      projects: projectResults,
    };
  }

  const client = jiraWith(auth);

  const result: SyncReleasesResult = {
    syncedProjects: [],
    totalReleases: 0,
    created: 0,
    updated: 0,
    tasksLinked: 0,
    errors: [],
    projects: [],
  };

  for (const projectKey of targetProjects) {
    const startAttempt = new Date();
    await recordReleaseCursor(projectKey, { lastStartedAt: startAttempt });

    try {
      const versions: JiraVersion[] = await client.getVersions(projectKey);
      if (!Array.isArray(versions)) {
        throw new Error(`Jira trả phản hồi không hợp lệ cho dự án ${projectKey}`);
      }

      result.syncedProjects.push(projectKey);

      let prjCreated = 0;
      let prjUpdated = 0;
      let prjTasksLinked = 0;

      if (versions.length === 0) {
        // Project genuinely has no Fix Versions configured on Jira
        await recordReleaseCursor(projectKey, {
          lastSuccessAt: new Date(),
          lastError: null,
          lastErrorAt: null,
          stats: {
            state: "empty",
            versionCount: 0,
            created: 0,
            updated: 0,
            tasksLinked: 0,
            errorCode: null,
          },
        });

        result.projects.push({
          projectKey,
          state: "empty",
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
          errorCode: null,
          errorMessage: null,
        });

        continue;
      }

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
          prjUpdated++;
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
          prjCreated++;
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

          prjTasksLinked += issues.length;
          result.tasksLinked += issues.length;
        } else {
          await prisma.releaseTask.deleteMany({
            where: { releaseId },
          });
        }
      }

      await recordReleaseCursor(projectKey, {
        lastSuccessAt: new Date(),
        lastError: null,
        lastErrorAt: null,
        stats: {
          state: "synced",
          versionCount: versions.length,
          created: prjCreated,
          updated: prjUpdated,
          tasksLinked: prjTasksLinked,
          errorCode: null,
        },
      });

      result.projects.push({
        projectKey,
        state: "synced",
        versionCount: versions.length,
        created: prjCreated,
        updated: prjUpdated,
        tasksLinked: prjTasksLinked,
        errorCode: null,
        errorMessage: null,
      });
    } catch (err) {
      const classified = classifyJiraError(err);
      result.errors.push(
        `Dự án ${projectKey}: ${classified.message}`
      );

      await recordReleaseCursor(projectKey, {
        lastErrorAt: new Date(),
        lastError: classified.message,
        stats: {
          state: classified.state,
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
          errorCode: classified.errorCode,
        },
      });

      result.projects.push({
        projectKey,
        state: classified.state,
        versionCount: 0,
        created: 0,
        updated: 0,
        tasksLinked: 0,
        errorCode: classified.errorCode,
        errorMessage: classified.message,
      });
    }
  }

  return result;
}
