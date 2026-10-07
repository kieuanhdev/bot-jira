import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { jiraWith, canCreateProjectVersion, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import {
  evaluateTaskReadiness,
  evaluateReleaseReadiness,
  type BranchDeliveryInfo,
} from "@/lib/releases/release-readiness";
import { computeReleaseSummary } from "@/lib/releases/release-summary";
import { env } from "@/lib/env";
import { getUserScopedProjects } from "@/lib/project-scope";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

const RELEASE_SELECT = {
  id: true,
  version: true,
  targetLabel: true,
  projectKey: true,
  jiraVersionId: true,
  description: true,
  releaseDate: true,
  createdById: true,
  releasedAt: true,
  status: true,
  archived: true,
  jiraUpdatedAt: true,
  lastSyncedAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  tasks: {
    select: {
      jiraKey: true,
      issue: {
        select: {
          jiraKey: true,
          status: true,
          statusCategory: true,
          summary: true,
          points: true,
          priority: true,
          labels: true,
          assigneeJira: true,
          deletedAt: true,
        },
      },
    },
  },
};

/** List releases, optionally filtered by project and readiness. Includes summary KPIs. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim() || undefined;
  const readinessFilter = url.searchParams.get("readiness")?.trim();
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const scope = await getUserScopedProjects(session.user.id, session.user.role);
  if (projectKey && projectKey !== "all" && !scope.includes(projectKey)) {
    return NextResponse.json({ error: "forbidden_project" }, { status: 403 });
  }

  const releases = await prisma.release.findMany({
    where: projectKey && projectKey !== "all" ? { projectKey } : { projectKey: { in: scope } },
    orderBy: { createdAt: "desc" },
    select: RELEASE_SELECT,
  });

  const cursor = projectKey && projectKey !== "all"
    ? await prisma.integrationCursor.findUnique({
        where: {
          integration_scope: {
            integration: "jira-releases",
            scope: projectKey,
          },
        },
      })
    : null;

  // Collect all unique Jira keys across releases for a single batched branch lookup
  const allJiraKeys = Array.from(
    new Set(
      releases.flatMap((r) =>
        r.tasks
          .map((t) => t.issue)
          .filter((i) => i && i.deletedAt == null)
          .map((i) => i.jiraKey)
      )
    )
  );

  const branches = allJiraKeys.length > 0
    ? await prisma.branchInfo.findMany({
        where: {
          jiraKey: { in: allJiraKeys },
          deletedAt: null,
        },
        select: {
          jiraKey: true,
          repo: true,
          branch: true,
          linkState: true,
          prId: true,
          prTitle: true,
          prUrl: true,
          prState: true,
          prDestinationBranch: true,
          merged: true,
          checkedAt: true,
          deletedAt: true,
        },
      })
    : [];

  const branchesByKey = new Map<string, BranchDeliveryInfo[]>();
  for (const b of branches) {
    if (!b.jiraKey) continue;
    const list = branchesByKey.get(b.jiraKey) || [];
    list.push({
      repo: b.repo,
      branch: b.branch,
      linkState: b.linkState,
      prId: b.prId,
      prTitle: b.prTitle,
      prUrl: b.prUrl,
      prState: b.prState,
      prDestinationBranch: b.prDestinationBranch,
      merged: b.merged,
      checkedAt: b.checkedAt,
      deletedAt: b.deletedAt,
    });
    branchesByKey.set(b.jiraKey, list);
  }

  const allowedDestinations = [env.bitbucketBaseBranch, "dev", "develop", "master", "main", "prod"].filter(Boolean);

  // Evaluate readiness for all releases
  const evaluatedReleases = releases.map((r) => {
    const activeTasks = r.tasks
      .map((t) => t.issue)
      .filter((i): i is NonNullable<typeof i> => i != null && i.deletedAt == null);

    const taskResults = activeTasks.map((issue) =>
      evaluateTaskReadiness(
        {
          jiraKey: issue.jiraKey,
          summary: issue.summary,
          status: issue.status,
          statusCategory: issue.statusCategory,
          labels: issue.labels,
          assignee: issue.assigneeJira,
          priority: issue.priority,
          points: issue.points,
          branches: branchesByKey.get(issue.jiraKey) || [],
        },
        { allowedDestinations }
      )
    );

    const isArchived = Boolean((r as { archived?: boolean }).archived);
    const readiness = evaluateReleaseReadiness(
      {
        jiraReleased: r.status === "released",
        released: r.status === "released",
        archived: isArchived,
        lastSyncedAt: (r as { lastSyncedAt?: Date | null }).lastSyncedAt,
      },
      taskResults
    );

    return {
      ...r,
      archived: isArchived,
      readiness: readiness.state,
      taskCount: readiness.taskCount,
      doneCount: readiness.doneCount,
      gitCompleteCount: readiness.gitCompleteCount,
      deliveryReadyCount: readiness.deliveryReadyCount,
      blockers: readiness.blockers,
      tasks: taskResults,
      // Compatibility fields for any legacy consumer
      latestCheck: null,
      approvals: [],
      gateOverrides: [],
    };
  });

  // Calculate summary across all items (totalActive, inProgress, ready, empty, released, archived)
  const summary = computeReleaseSummary(
    evaluatedReleases.map((r) => ({
      id: r.id,
      archived: r.archived,
      jiraReleased: r.readiness === "released",
      taskCount: r.taskCount,
      deliveryReadyCount: r.deliveryReadyCount,
    }))
  );

  // Filter items by readiness or archived state
  let items = evaluatedReleases;
  if (readinessFilter === "archived") {
    items = items.filter((r) => r.archived);
  } else if (readinessFilter && readinessFilter !== "all") {
    items = items.filter((r) => !r.archived && r.readiness === readinessFilter);
  } else if (!includeArchived) {
    items = items.filter((r) => !r.archived);
  }

  let syncState: "never_synced" | "synced" | "empty" | "forbidden" | "auth_required" | "failed" = "never_synced";
  let lastErrorCode: string | null = null;
  let lastError: string | null = null;
  let isStale = false;

  if (cursor) {
    lastError = cursor.lastError;
    const stats = (cursor.stats as Record<string, unknown> | null) ?? null;
    if (stats?.errorCode && typeof stats.errorCode === "string") {
      lastErrorCode = stats.errorCode;
    }
    if (stats?.state && typeof stats.state === "string") {
      syncState = stats.state as typeof syncState;
    } else if (cursor.lastSuccessAt) {
      syncState = releases.length === 0 ? "empty" : "synced";
    } else if (cursor.lastError) {
      syncState = "failed";
    }

    if (cursor.lastSuccessAt && cursor.lastErrorAt && cursor.lastErrorAt > cursor.lastSuccessAt) {
      isStale = true;
    }
  } else if (projectKey && projectKey !== "all" && releases.length > 0) {
    syncState = "synced";
  }

  return NextResponse.json({
    summary,
    items,
    jiraBaseUrl: env.jiraBaseUrl || null,
    sync: {
      state: syncState,
      lastAttemptAt: cursor?.lastStartedAt?.toISOString() ?? null,
      lastSuccessAt: cursor?.lastSuccessAt?.toISOString() ?? null,
      lastErrorCode,
      lastError,
      stale: isStale,
    },
  });
}

/**
 * Create a release. Identified by a Jira Fix Version:
 * { projectKey, jiraVersionId? , version, description?, targetLabel? }.
 * Requires release.manage permission (REL-S07).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    projectKey?: string;
    jiraVersionId?: string;
    version: string;
    description?: string;
    targetLabel?: string;
    notes?: string;
  };

  if (!body.version || !body.version.trim()) {
    return NextResponse.json({ error: "version required" }, { status: 400 });
  }

  const projectKey = body.projectKey?.trim() ?? "";
  const targetLabel = body.targetLabel?.trim() ?? "";

  if (!projectKey && !targetLabel) {
    return NextResponse.json(
      { error: "projectKey (with a Jira Fix Version) or a legacy targetLabel is required" },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Resolve the Jira Fix Version identity.
  let jiraVersionId: string | null = null;
  let releaseDate: Date | null = null;
  let isReleased = false;
  let isArchived = false;

  if (projectKey) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
    });
    const auth = userJiraAuth(user);
    if (!auth) {
      return jiraCredentialsRequired();
    }
    const client = jiraWith(auth);

    try {
      if (body.jiraVersionId) {
        // Verify the requested version exists in Jira before persisting.
        const versions = await client.getVersions(projectKey);
        const match = versions.find((v) => v.id === body.jiraVersionId);
        if (!match) {
          return NextResponse.json(
            { error: `Jira Fix Version ${body.jiraVersionId} not found in project ${projectKey}` },
            { status: 404 }
          );
        }
        jiraVersionId = match.id;
        releaseDate = match.releaseDate ? new Date(match.releaseDate) : null;
        isReleased = Boolean(match.released);
        isArchived = Boolean(match.archived);
      } else {
        // Pre-check Jira permissions for creating a Fix Version in the project
        const permissions = await client.getMyPermissions(projectKey);
        if (!canCreateProjectVersion(permissions)) {
          return NextResponse.json(
            {
              error: "Bạn không có quyền tạo Fix Version trong dự án này.",
              code: "jira_project_permission_required",
            },
            { status: 403 }
          );
        }

        // No version given: create a new Fix Version in Jira.
        const created = await client.createVersion(projectKey, body.version, body.description);
        if (!created?.id) {
          return NextResponse.json(
            { error: "Jira did not return a version id while creating the Fix Version" },
            { status: 502 }
          );
        }
        jiraVersionId = created.id;
        releaseDate = created.releaseDate ? new Date(created.releaseDate) : null;
        isReleased = Boolean(created.released);
        isArchived = Boolean(created.archived);
      }
    } catch (e) {
      if (e instanceof JiraRequestError) {
        if (e.status === 403) {
          return NextResponse.json(
            {
              error: "Bạn không có quyền tạo Fix Version trong dự án này.",
              code: "jira_project_permission_required",
            },
            { status: 403 }
          );
        }
        if (e.status === 401) {
          return NextResponse.json(
            {
              error: "Jira token không hợp lệ hoặc đã hết hạn.",
              code: "jira_auth_failed",
            },
            { status: 502 }
          );
        }
      }
      const msg = e instanceof JiraRequestError ? e.message : (e as Error).message;
      return NextResponse.json(
        { error: `Jira version lookup failed: ${msg}`, code: "jira_unavailable" },
        { status: 502 }
      );
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

    // Attach all cached issues carrying this Fix Version.
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
      await prisma.releaseTask.createMany({
        data: issues.map((i) => ({ releaseId: release.id, jiraKey: i.jiraKey })),
        skipDuplicates: true,
      });
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
      await prisma.releaseTask.createMany({
        data: issues.map((i) => ({ releaseId: release.id, jiraKey: i.jiraKey })),
        skipDuplicates: true,
      });
    }
  }

  await audit({
    actorId: userId,
    actorEmail: session.user.email ?? null,
    action: "release.create",
    source: "web",
    target: release.id,
    after: { projectKey, version: body.version, jiraVersionId },
  });

  return NextResponse.json({ release });
}
