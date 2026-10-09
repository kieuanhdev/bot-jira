/**
 * Release context loader — builds the ReleaseContext for the gate engine from a
 * release row, issues, dependencies, branch models, approvals, Sentry and CI.
 *
 * Semantics:
 *  - Tasks are derived from the live IssueCache via `fixVersionIds` when the
 *    release is identified by a Jira Fix Version (M3-01); legacy label-based
 *    releases fall back to the frozen ReleaseTask snapshot.
 *  - Branch info is read from the BranchInfo read model, scoped to the release
 *    task keys.
 *  - Sentry unresolved issues are fetched live; on failure null is recorded so
 *    the sentry gate reports `unknown` (fail-safe) rather than crashing.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  hasSentryConfig as defaultHasSentryConfig,
  releaseRequiredApprovals as defaultReleaseRequiredApprovals,
  env,
} from "@/lib/env";
import { sentry as defaultSentry } from "@/lib/sentry/client";
import { expandDependencies as defaultExpandDependencies } from "@/lib/issues/dependencies";
import {
  selectReleaseBranches,
  type ReleaseContext,
  type TaskInfo,
  type BranchInfoRow,
  type SentryIssueInfo,
  type CiBuildState,
} from "@/lib/releases/gates";

export interface ReleaseContextDependencies {
  prisma?: {
    release: {
      findUnique: (args: {
        where: { id: string };
        include?: object;
      }) => Promise<{
        id: string;
        version: string;
        projectKey?: string | null;
        jiraVersionId?: string | null;
        tasks?: Array<{
          jiraKey: string;
          issue: {
            projectKey?: string | null;
            summary: string;
            description: string;
            priority: string;
            status: string;
            statusCategory: string;
            type: string;
            lastSyncedAt: Date;
          };
        }>;
      } | null>;
    };
    issueCache: {
      findMany: (args: {
        where: { deletedAt: null; fixVersionIds: { has: string } };
        select?: object;
      }) => Promise<Array<{
        jiraKey: string;
        projectKey: string;
        summary: string;
        description: string;
        priority: string;
        status: string;
        statusCategory: string;
        type: string;
        lastSyncedAt: Date;
        fixVersionIds: string[];
        deletedAt: Date | null;
      }>>;
    };
    branchInfo: {
      findMany: () => Promise<Array<{
        repo: string;
        branch: string;
        prState: string | null;
        prDestinationBranch: string | null;
        merged: boolean;
        checkedAt: Date;
      }>>;
    };
    releaseApproval: {
      findMany: (args: {
        where: { releaseId: string; revokedAt: null };
        select?: object;
      }) => Promise<Array<{ type: string }>>;
    };
    ciBuildStatus: {
      findMany: (args: {
        where: { repo: { in: string[] } };
        orderBy?: object;
        take?: number;
      }) => Promise<Array<{
        provider: string;
        commitSha: string;
        status: string;
        testStatus: string | null;
        url: string | null;
        completedAt: Date | null;
      }>>;
    };
  };
  sentryClient?: {
    listUnresolvedIssues: (limit?: number) => Promise<Array<{
      id: string | number;
      shortId: string;
      title: string;
      level?: string | null;
      status?: string | null;
      permalinkUrl?: string;
    }>>;
  };
  expandDependenciesFn?: typeof defaultExpandDependencies;
  now?: () => Date;
  envConfig?: {
    ciGateEnabled?: boolean;
    hasSentryConfig?: () => boolean;
    releaseRequiredApprovals?: string[];
  };
}

export async function buildReleaseContext(
  releaseId: string,
  version: string,
  deps?: ReleaseContextDependencies
): Promise<ReleaseContext | null> {
  const checkedAt = deps?.now ? deps.now() : new Date();
  const db = deps?.prisma ?? defaultPrisma;

  const release = await db.release.findUnique({
    where: { id: releaseId },
    include: {
      tasks: {
        include: {
          issue: {
            select: {
              projectKey: true,
              summary: true,
              description: true,
              priority: true,
              status: true,
              statusCategory: true,
              type: true,
              lastSyncedAt: true,
            },
          },
        },
      },
    },
  });
  if (!release) return null;

  let tasks: TaskInfo[];
  let dependencyGraph: ReleaseContext["dependencyGraph"] | undefined;

  if (release.jiraVersionId) {
    const issues = await db.issueCache.findMany({
      where: { deletedAt: null, fixVersionIds: { has: release.jiraVersionId } },
      select: {
        jiraKey: true,
        projectKey: true,
        summary: true,
        description: true,
        priority: true,
        status: true,
        statusCategory: true,
        type: true,
        lastSyncedAt: true,
        fixVersionIds: true,
        deletedAt: true,
      },
    });
    const directIssues = issues.filter((i: { deletedAt?: Date | null }) => !i.deletedAt);
    const directKeys = directIssues.map((i: { jiraKey: string }) => i.jiraKey);

    // Expand dependencies (DEP-09)
    const expandFn = deps?.expandDependenciesFn ?? defaultExpandDependencies;
    const graph = await expandFn({ rootKeys: directKeys });
    dependencyGraph = {
      cycles: graph.cycles,
      truncated: graph.truncated,
      missingKeys: graph.missingKeys,
    };

    // Build unique task list
    const taskMap = new Map<string, TaskInfo>();

    for (const d of directIssues) {
      taskMap.set(d.jiraKey, {
        jiraKey: d.jiraKey,
        projectKey: d.projectKey,
        summary: d.summary,
        description: d.description,
        priority: d.priority,
        status: d.status,
        statusCategory: d.statusCategory,
        issueType: d.type,
        lastSyncedAt: d.lastSyncedAt,
        inclusion: "direct",
        rootKeys: [d.jiraKey],
        depth: 0,
        sameProject: true,
        hasReleaseVersion: true,
      });
    }

    for (const depNode of graph.issues) {
      if (depNode.relation === "dependency") {
        const existing = taskMap.get(depNode.key);
        if (existing) {
          if (depNode.rootKey && !existing.rootKeys?.includes(depNode.rootKey)) {
            existing.rootKeys = [...(existing.rootKeys ?? []), depNode.rootKey];
          }
        } else {
          const depIssue = depNode.issue;
          const depProjectKey = depIssue?.projectKey ?? depNode.key.split("-")[0];
          const sameProj = Boolean(
            release.projectKey && depProjectKey && release.projectKey === depProjectKey
          );
          const hasRelVer = (depIssue?.fixVersionIds ?? []).includes(release.jiraVersionId);

          taskMap.set(depNode.key, {
            jiraKey: depNode.key,
            projectKey: depProjectKey,
            summary: depIssue?.summary ?? "",
            description: depIssue?.description ?? "",
            priority: depIssue?.priority ?? "",
            status: depIssue?.status ?? "",
            statusCategory: depIssue?.statusCategory ?? "unknown",
            issueType: depIssue?.type ?? "",
            lastSyncedAt: depIssue?.lastSyncedAt ?? new Date(0),
            inclusion: "dependency",
            rootKeys: depNode.rootKey ? [depNode.rootKey] : depNode.via ? [depNode.via] : [],
            depth: depNode.depth,
            sameProject: sameProj,
            hasReleaseVersion: hasRelVer,
          });
        }
      }
    }

    tasks = Array.from(taskMap.values());
  } else {
    tasks = (release.tasks ?? []).map((t) => ({
      jiraKey: t.jiraKey,
      projectKey: t.issue.projectKey || release.projectKey || "",
      summary: t.issue.summary,
      description: t.issue.description,
      priority: t.issue.priority,
      status: t.issue.status,
      statusCategory: t.issue.statusCategory,
      issueType: t.issue.type,
      lastSyncedAt: t.issue.lastSyncedAt,
      inclusion: "direct",
      rootKeys: [t.jiraKey],
      depth: 0,
      sameProject: true,
      hasReleaseVersion: false,
    }));
  }

  const branchRows = await db.branchInfo.findMany();
  const allBranchInfos: BranchInfoRow[] = branchRows.map((b) => ({
    repo: b.repo,
    branch: b.branch,
    prState: b.prState,
    prDestinationBranch: b.prDestinationBranch,
    merged: b.merged,
    checkedAt: b.checkedAt,
  }));
  const branchInfos = selectReleaseBranches(allBranchInfos, tasks.map((t) => t.jiraKey));

  // REL-03 — load non-revoked approvals so the manual_approval gate reflects
  // the current sign-off state.
  const requiredApprovals =
    deps?.envConfig?.releaseRequiredApprovals ?? defaultReleaseRequiredApprovals;
  let approvalsPresent: { type: string; present: boolean }[] = [];
  if (requiredApprovals.length > 0) {
    const approvals = await db.releaseApproval.findMany({
      where: { releaseId, revokedAt: null },
      select: { type: true },
    });
    approvalsPresent = requiredApprovals.map((type) => ({
      type,
      present: approvals.some((a) => a.type === type),
    }));
  }

  let sentryIssues: SentryIssueInfo[] | null = null;
  let sentryCheckedAt: Date | null = null;
  const shouldCheckSentry = deps?.envConfig?.hasSentryConfig
    ? deps.envConfig.hasSentryConfig()
    : defaultHasSentryConfig();

  if (shouldCheckSentry) {
    const sentryClient = deps?.sentryClient ?? defaultSentry;
    try {
      const issues = await sentryClient.listUnresolvedIssues(50);
      sentryIssues = issues.map((i) => ({
        id: String(i.id),
        shortId: i.shortId,
        title: i.title,
        level: i.level ?? "",
        status: i.status ?? "unresolved",
        permalinkUrl: i.permalinkUrl,
      }));
      sentryCheckedAt = checkedAt;
    } catch {
      sentryIssues = null;
      sentryCheckedAt = null;
    }
  }

  // REL-04 — load the latest CI build states for the release scope.
  let ciBuilds: CiBuildState[] = [];
  const ciGateEnabled = deps?.envConfig?.ciGateEnabled ?? env.ciGateEnabled;
  if (ciGateEnabled) {
    const ciRows = await db.ciBuildStatus.findMany({
      where: { repo: { in: branchRows.map((b) => b.repo) } },
      orderBy: { receivedAt: "desc" },
      take: 50,
    });
    ciBuilds = ciRows.map((c) => ({
      provider: c.provider,
      commitSha: c.commitSha,
      status: c.status,
      testStatus: c.testStatus,
      url: c.url,
      completedAt: c.completedAt,
      expectedCommitSha: c.commitSha,
    }));
  }

  return {
    releaseId,
    version,
    projectKey: release.projectKey ?? "",
    tasks,
    branchInfos,
    sentryIssues,
    sentryCheckedAt,
    requiredApprovals,
    approvalsPresent,
    ciBuilds,
    ciGateEnabled,
    dependencyGraph,
    checkedAt,
  };
}
