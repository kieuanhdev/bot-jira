import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notifyAll } from "@/lib/notify";
import { jiraWith, canCreateProjectVersion, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import type { JiraVersion } from "@/lib/jira/types";
import { userJiraAuth } from "@/lib/user-creds";
import { getReleaseReadiness } from "./release-readiness";
import { findReleaseById, updateReleaseStatus, attachReleaseIssues } from "./repository";

export type JiraClientInstance = ReturnType<typeof jiraWith>;

export const JIRA_CREDENTIALS_REQUIRED_PAYLOAD = {
  error: "Bạn cần cấu hình token Jira cá nhân trong Settings.",
  code: "jira_credentials_required",
};

export type PublishReleaseActor = {
  id?: string | null;
  email?: string | null;
};

export type PublishReleaseOptions = {
  auth?: JiraAuth | null;
  client?: JiraClientInstance;
};

export type PublishReleaseResult =
  | {
      status: 200;
      body: {
        ok: true;
        released: true;
        already: boolean;
        releasedAt?: string | null;
        release?: { id: string; version: string; status: string; releasedAt: Date | null };
      };
    }
  | {
      status: 404;
      body: { error: string };
    }
  | {
      status: 409;
      body:
        | { error: string; message?: string }
        | {
            error: "EMPTY_RELEASE" | "RELEASE_NOT_READY";
            readiness: string;
            taskCount: number;
            doneCount: number;
            gitCompleteCount: number;
            deliveryReadyCount: number;
            blockers: unknown[];
          };
    }
  | {
      status: 428;
      body: { error: string; code: string };
    }
  | {
      status: 500;
      body: { error: string };
    }
  | {
      status: 502;
      body: { error: string; detail: string };
    };

/**
 * Execute the release publication workflow:
 * 1. Validates local release state & Jira Fix Version binding
 * 2. Checks idempotency (DB or Jira already released)
 * 3. Verifies readiness (tasks Done + Git merge)
 * 4. Calls Jira mutation (releaseVersion)
 * 5. Updates DB, records audit log, and dispatches notifications
 */
export async function publishRelease(
  releaseId: string,
  actor: PublishReleaseActor,
  options: PublishReleaseOptions = {}
): Promise<PublishReleaseResult> {
  const actorId = actor.id ?? null;
  const actorEmail = actor.email ?? null;

  const release = await findReleaseById(releaseId);
  if (!release) {
    return { status: 404, body: { error: "not found" } };
  }

  // Idempotency: already marked released locally
  if (release.status === "released") {
    return {
      status: 200,
      body: {
        ok: true,
        released: true,
        already: true,
        releasedAt: release.releasedAt?.toISOString() ?? null,
      },
    };
  }

  // Need a Jira Fix Version to release
  if (!release.jiraVersionId || !release.projectKey) {
    return {
      status: 409,
      body: { error: "release is not tied to a Jira Fix Version (projectKey + jiraVersionId required)" },
    };
  }

  // Personal Jira credentials required for mutation
  let auth = options.auth;
  if (!auth) {
    const user = await prisma.user.findUnique({
      where: { id: actorId ?? "" },
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
    });
    auth = userJiraAuth(user);
  }

  if (!auth) {
    return {
      status: 428,
      body: JIRA_CREDENTIALS_REQUIRED_PAYLOAD,
    };
  }

  const client = options.client ?? jiraWith(auth);

  // Check Jira version directly
  try {
    let jiraVersion: JiraVersion | null = null;
    if (typeof client.getVersion === "function") {
      jiraVersion = await client.getVersion(release.jiraVersionId).catch(() => null);
    }
    if (!jiraVersion && typeof client.getVersions === "function") {
      const versions: JiraVersion[] = await client.getVersions(release.projectKey).catch(() => []);
      jiraVersion = versions.find((v: JiraVersion) => v.id === release.jiraVersionId) || null;
    }

    if (jiraVersion) {
      if (jiraVersion.released) {
        // Idempotent sync from Jira
        const updated = await updateReleaseStatus(releaseId, "released", new Date());
        return {
          status: 200,
          body: {
            ok: true,
            released: true,
            already: true,
            releasedAt: updated.releasedAt?.toISOString() ?? null,
          },
        };
      }
      if (jiraVersion.archived) {
        return {
          status: 409,
          body: { error: "VERSION_ARCHIVED", message: "Fix Version đã bị lưu trữ trên Jira." },
        };
      }
    }
  } catch {
    // Proceed to readiness check
  }

  // Evaluate release readiness from Jira tasks and Git branch/PR data
  const readiness = await getReleaseReadiness(releaseId);
  if (!readiness) {
    return { status: 500, body: { error: "could not evaluate release readiness" } };
  }

  if (readiness.state !== "ready") {
    await audit({
      actorId,
      actorEmail,
      action: "release.publish_failed",
      source: "web",
      target: release.jiraVersionId,
      after: {
        reason: readiness.state === "empty" ? "EMPTY_RELEASE" : "RELEASE_NOT_READY",
        taskCount: readiness.taskCount,
        blockersCount: readiness.blockers.length,
      },
    });

    return {
      status: 409,
      body: {
        error: readiness.state === "empty" ? "EMPTY_RELEASE" : "RELEASE_NOT_READY",
        readiness: readiness.state,
        taskCount: readiness.taskCount,
        doneCount: readiness.doneCount,
        gitCompleteCount: readiness.gitCompleteCount,
        deliveryReadyCount: readiness.deliveryReadyCount,
        blockers: readiness.blockers,
      },
    };
  }

  // Ready: call Jira mutation once
  try {
    await client.releaseVersion(release.jiraVersionId);
  } catch (e) {
    await audit({
      actorId,
      actorEmail,
      action: "release.publish_failed",
      source: "web",
      target: release.jiraVersionId,
      after: { error: (e as Error).message.slice(0, 300) },
    });

    return {
      status: 502,
      body: { error: "Jira release failed", detail: (e as Error).message.slice(0, 200) },
    };
  }

  // Update local DB to released after Jira confirms
  const updated = await updateReleaseStatus(releaseId, "released", new Date());

  await audit({
    actorId,
    actorEmail,
    action: "release.publish",
    source: "web",
    target: release.jiraVersionId,
    before: { status: release.status },
    after: { status: "released", version: release.version },
  });

  await notifyAll({
    type: "release",
    title: `Bản phát hành ${release.version} đã được công bố`,
    body: `Fix Version ${release.projectKey} được phát hành bởi ${actorEmail ?? "release manager"}.`,
    link: "/release",
    severity: "success",
    eventKey: `release:${release.id}:published`,
  }).catch(() => null);

  return {
    status: 200,
    body: {
      ok: true,
      released: true,
      already: false,
      release: updated,
    },
  };
}

export type CreateReleaseInput = {
  projectKey?: string;
  jiraVersionId?: string;
  version: string;
  description?: string;
  targetLabel?: string;
  notes?: string;
};

export type CreateReleaseResult =
  | {
      status: 200;
      body: { release: unknown };
    }
  | {
      status: 400;
      body: { error: string };
    }
  | {
      status: 403;
      body: { error: string; code: string };
    }
  | {
      status: 404;
      body: { error: string };
    }
  | {
      status: 428;
      body: { error: string; code: string };
    }
  | {
      status: 502;
      body: { error: string; code?: string };
    };

/**
 * Create or link a Jira Fix Version and persist it in the Release read model.
 */
export async function createReleaseWithJira(
  body: CreateReleaseInput,
  actor: { id: string; email?: string | null },
  options: PublishReleaseOptions = {}
): Promise<CreateReleaseResult> {
  if (!body.version || !body.version.trim()) {
    return { status: 400, body: { error: "version required" } };
  }

  const projectKey = body.projectKey?.trim() ?? "";
  const targetLabel = body.targetLabel?.trim() ?? "";

  if (!projectKey && !targetLabel) {
    return {
      status: 400,
      body: { error: "projectKey (with a Jira Fix Version) or a legacy targetLabel is required" },
    };
  }

  const userId = actor.id;

  let jiraVersionId: string | null = null;
  let releaseDate: Date | null = null;
  let isReleased = false;
  let isArchived = false;

  if (projectKey) {
    let auth = options.auth;
    if (!auth) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
      });
      auth = userJiraAuth(user);
    }
    if (!auth) {
      return { status: 428, body: JIRA_CREDENTIALS_REQUIRED_PAYLOAD };
    }
    const client = options.client ?? jiraWith(auth);

    try {
      if (body.jiraVersionId) {
        // Verify requested version exists in Jira before persisting
        const versions: JiraVersion[] = await client.getVersions(projectKey);
        const match = versions.find((v: JiraVersion) => v.id === body.jiraVersionId);
        if (!match) {
          return {
            status: 404,
            body: { error: `Jira Fix Version ${body.jiraVersionId} not found in project ${projectKey}` },
          };
        }
        jiraVersionId = match.id;
        releaseDate = match.releaseDate ? new Date(match.releaseDate) : null;
        isReleased = Boolean(match.released);
        isArchived = Boolean(match.archived);
      } else {
        // Pre-check Jira permissions for creating a Fix Version
        const permissions = await client.getMyPermissions(projectKey);
        if (!canCreateProjectVersion(permissions)) {
          return {
            status: 403,
            body: {
              error: "Bạn không có quyền tạo Fix Version trong dự án này.",
              code: "jira_project_permission_required",
            },
          };
        }

        // Create new Fix Version in Jira
        const created = await client.createVersion(projectKey, body.version, body.description);
        if (!created?.id) {
          return {
            status: 502,
            body: { error: "Jira did not return a version id while creating the Fix Version" },
          };
        }
        jiraVersionId = created.id;
        releaseDate = created.releaseDate ? new Date(created.releaseDate) : null;
        isReleased = Boolean(created.released);
        isArchived = Boolean(created.archived);
      }
    } catch (e) {
      if (e instanceof JiraRequestError) {
        if (e.status === 403) {
          return {
            status: 403,
            body: {
              error: "Bạn không có quyền tạo Fix Version trong dự án này.",
              code: "jira_project_permission_required",
            },
          };
        }
        if (e.status === 401) {
          return {
            status: 502,
            body: {
              error: "Jira token không hợp lệ hoặc đã hết hạn.",
              code: "jira_auth_failed",
            },
          };
        }
      }
      const msg = e instanceof JiraRequestError ? e.message : (e as Error).message;
      return {
        status: 502,
        body: { error: `Jira version lookup failed: ${msg}`, code: "jira_unavailable" },
      };
    }
  }

  const now = new Date();
  let release: Awaited<ReturnType<typeof prisma.release.findUniqueOrThrow>>;

  if (jiraVersionId) {
    const found = await prisma.release.findFirst({
      where: { projectKey, jiraVersionId },
    });
    if (found) {
      release = await prisma.release.update({
        where: { id: found.id },
        data: {
          version: body.version,
          archived: isArchived,
          status: isReleased ? "released" : "draft",
          lastSyncedAt: now,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(releaseDate ? { releaseDate } : {}),
        },
      });
    } else {
      release = await prisma.release.create({
        data: {
          version: body.version,
          projectKey,
          jiraVersionId,
          description: body.description ?? "",
          releaseDate,
          archived: isArchived,
          status: isReleased ? "released" : "draft",
          releasedAt: isReleased ? (releaseDate ?? now) : null,
          createdById: userId,
          lastSyncedAt: now,
          notes: body.notes ?? "",
        },
      });
    }

    // Attach matching issues from IssueCache
    const issues = await prisma.issueCache.findMany({
      where: {
        projectKey,
        deletedAt: null,
        OR: [
          { fixVersionIds: { has: jiraVersionId } },
          { fixVersionNames: { has: body.version } },
        ],
      },
      select: { jiraKey: true },
    });
    if (issues.length) {
      await attachReleaseIssues(release.id, issues.map((i) => i.jiraKey));
    }
  } else {
    // Legacy label-based release
    const found = await prisma.release.findFirst({
      where: { targetLabel, jiraVersionId: null },
    });
    if (found) {
      release = await prisma.release.update({
        where: { id: found.id },
        data: {
          version: body.version,
          projectKey,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
    } else {
      release = await prisma.release.create({
        data: {
          version: body.version,
          projectKey,
          targetLabel,
          description: body.description ?? "",
          createdById: userId,
          notes: body.notes ?? "",
        },
      });
    }

    const issues = await prisma.issueCache.findMany({
      where: { labels: { has: targetLabel } },
      select: { jiraKey: true },
    });
    if (issues.length) {
      await attachReleaseIssues(release.id, issues.map((i) => i.jiraKey));
    }
  }

  await audit({
    actorId: userId,
    actorEmail: actor.email ?? null,
    action: "release.create",
    source: "web",
    target: release.id,
    after: { projectKey, version: body.version, jiraVersionId },
  });

  return { status: 200, body: { release } };
}

/**
 * Fetch Jira Fix Versions for a project.
 */
export async function fetchProjectJiraVersions(
  projectKey: string,
  auth: JiraAuth,
  client?: JiraClientInstance
): Promise<JiraVersion[]> {
  const c = client ?? jiraWith(auth);
  return c.getVersions(projectKey);
}
