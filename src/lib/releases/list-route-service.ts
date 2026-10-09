import { loadConfirmedBranchRows } from "@/lib/bitbucket/branch-links";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  evaluateTaskReadiness,
  evaluateReleaseReadiness,
  type BranchDeliveryInfo,
} from "@/lib/releases/release-readiness";
import { computeReleaseSummary } from "@/lib/releases/release-summary";
import { env } from "@/lib/env";
import { getUserScopedProjects } from "@/lib/project-scope";
import { createReleaseWithJira, type CreateReleaseInput } from "@/lib/releases/jira-mutation";

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
export async function handleReleaseListRequest(req: Request) {
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

  const branches = await loadConfirmedBranchRows(allJiraKeys);

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
export async function handleCreateReleaseRequest(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as CreateReleaseInput;
  const result = await createReleaseWithJira(body, {
    id: session.user.id,
    email: session.user.email ?? null,
  });

  return NextResponse.json(result.body, { status: result.status });
}
