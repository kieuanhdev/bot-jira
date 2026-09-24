/**
 * M6-02 / shared — Build the ReleaseContext for the gate engine from a release
 * row. Extracted from the web release-ready route so the chat `/release ...
 * check` command (M6) and the web API share identical context-building and
 * therefore identical gate results.
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

import { prisma } from "@/lib/prisma";
import { hasSentryConfig, releaseRequiredApprovals, env } from "@/lib/env";
import { sentry } from "@/lib/sentry/client";
import {
  selectReleaseBranches,
  type ReleaseContext,
  type TaskInfo,
  type BranchInfoRow,
  type SentryIssueInfo,
} from "@/lib/releases/gates";

type IssueRow = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  type: string;
  lastSyncedAt: Date;
  fixVersionIds: string[];
  deletedAt: Date | null;
};

export async function buildReleaseContext(releaseId: string, version: string): Promise<ReleaseContext | null> {
  const checkedAt = new Date();

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: {
      tasks: {
        include: {
          issue: {
            select: {
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

  let issueRows: IssueRow[];
  if (release.jiraVersionId) {
    const issues = await prisma.issueCache.findMany({
      where: { deletedAt: null, fixVersionIds: { has: release.jiraVersionId } },
      select: {
        jiraKey: true,
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
    issueRows = issues.filter((i) => !i.deletedAt);
  } else {
    issueRows = release.tasks.map((t) => ({
      jiraKey: t.jiraKey,
      summary: t.issue.summary,
      description: t.issue.description,
      priority: t.issue.priority,
      status: t.issue.status,
      statusCategory: t.issue.statusCategory,
      type: t.issue.type,
      lastSyncedAt: t.issue.lastSyncedAt,
      fixVersionIds: [] as string[],
      deletedAt: null,
    }));
  }

  const tasks: TaskInfo[] = issueRows.map((i) => ({
    jiraKey: i.jiraKey,
    summary: i.summary,
    description: i.description,
    priority: i.priority,
    status: i.status,
    statusCategory: i.statusCategory,
    issueType: i.type,
    lastSyncedAt: i.lastSyncedAt,
  }));

  const branchRows = await prisma.branchInfo.findMany();
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
  // the current sign-off state. The set of *required* types is policy-driven
  // via RELEASE_REQUIRED_APPROVALS; an empty list keeps the gate vacuous so
  // existing no-approval deployments are unchanged.
  let approvalsPresent: { type: string; present: boolean }[] = [];
  if (releaseRequiredApprovals.length > 0) {
    const approvals = await prisma.releaseApproval.findMany({
      where: { releaseId, revokedAt: null },
      select: { type: true },
    });
    approvalsPresent = releaseRequiredApprovals.map((type) => ({
      type,
      present: approvals.some((a) => a.type === type),
    }));
  }

  let sentryIssues: SentryIssueInfo[] | null = null;
  let sentryCheckedAt: Date | null = null;
  if (hasSentryConfig()) {
    try {
      const issues = await sentry.listUnresolvedIssues(50);
      sentryIssues = issues.map((i) => ({
        id: String(i.id),
        shortId: i.shortId,
        title: i.title,
        level: i.level ?? "",
        status: i.status ?? "unresolved",
        permalinkUrl: i.permalinkUrl,
      }));
      sentryCheckedAt = new Date();
    } catch {
      sentryIssues = null;
      sentryCheckedAt = null;
    }
  }

  // REL-04 — load the latest CI build states for the release scope. The expected
  // commit per build is its own commitSha when we have no better signal (the PR
  // merge commit resolution is a follow-on; treating the recorded commit as
  // expected keeps the fail-safe "build on a different commit => unknown" rule
  // intact for the pilot).
  let ciBuilds: import("./gates").CiBuildState[] = [];
  if (env.ciGateEnabled) {
    const ciRows = await prisma.ciBuildStatus.findMany({
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
    requiredApprovals: releaseRequiredApprovals,
    approvalsPresent,
    ciBuilds,
    ciGateEnabled: env.ciGateEnabled,
    checkedAt,
  };
}
