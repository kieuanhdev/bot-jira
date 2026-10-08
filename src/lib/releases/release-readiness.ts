import { loadConfirmedBranchRows } from "@/lib/bitbucket/branch-links";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export type ReleaseReadinessState = "empty" | "in_progress" | "ready" | "released";

export type ReleaseBlockerCode =
  | "TASK_NOT_DONE"
  | "NO_CONFIRMED_BRANCH"
  | "BRANCH_LINK_UNCONFIRMED"
  | "NO_PULL_REQUEST"
  | "PR_NOT_MERGED"
  | "WRONG_MERGE_DESTINATION"
  | "JIRA_DATA_STALE"
  | "GIT_DATA_STALE"
  | "GIT_UNAVAILABLE";

export type ReleaseBlocker = {
  code: ReleaseBlockerCode;
  jiraKey: string;
  summary: string;
  status: string;
  repo?: string;
  branch?: string;
  prUrl?: string;
  reason?: string;
};

export type BranchDeliveryInfo = {
  repo: string;
  branch: string;
  linkState: string;
  prId?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  prState?: string | null;
  prDestinationBranch?: string | null;
  merged: boolean;
  checkedAt?: Date | string | null;
  deletedAt?: Date | string | null;
};

export type TaskReadinessInput = {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory?: string | null;
  labels?: string[];
  assignee?: string | null;
  priority?: string;
  points?: number | null;
  branches?: BranchDeliveryInfo[];
};

export type TaskReadinessResult = {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  assignee?: string | null;
  priority?: string;
  points?: number | null;
  isDone: boolean;
  noCode: boolean;
  gitComplete: boolean;
  ready: boolean;
  blockers: ReleaseBlocker[];
  branches: BranchDeliveryInfo[];
};

export type ReleaseReadinessOptions = {
  noCodeLabels?: string[];
  allowedDestinations?: string[];
  jiraDataFresh?: boolean;
  gitDataFresh?: boolean;
  gitUnavailable?: boolean;
  lastJiraSyncedAt?: string | null;
  lastGitSyncedAt?: string | null;
};

export type ReleaseReadiness = {
  state: ReleaseReadinessState;
  taskCount: number;
  doneCount: number;
  gitCompleteCount: number;
  deliveryReadyCount: number;
  blockers: ReleaseBlocker[];
  tasks: TaskReadinessResult[];
  jiraDataFresh: boolean;
  gitDataFresh: boolean;
  lastJiraSyncedAt: string | null;
  lastGitSyncedAt: string | null;
};

/** Get configured no-code labels from env or fallback to ["no-code"]. */
export function getNoCodeLabels(custom?: string[]): string[] {
  if (custom && custom.length > 0) {
    return custom.map((l) => l.trim().toLowerCase());
  }
  const raw = process.env.RELEASE_NO_CODE_LABELS || "no-code";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Check if task has a no-code label (case-insensitive). */
export function isNoCodeTask(labels: string[] = [], noCodeLabels: string[] = ["no-code"]): boolean {
  if (!labels || labels.length === 0) return false;
  const set = new Set(noCodeLabels.map((l) => l.toLowerCase()));
  return labels.some((l) => set.has(l.trim().toLowerCase()));
}

/** Check if destination branch is allowed. */
export function isDestinationAllowed(
  destination: string | null | undefined,
  allowedDestinations?: string[]
): boolean {
  if (!destination) return true;
  const d = destination.trim().toLowerCase();
  if (allowedDestinations && allowedDestinations.length > 0) {
    return allowedDestinations.some((a) => a.trim().toLowerCase() === d);
  }
  if (/^(dev|develop|master|main|prod)$/i.test(d)) return true;
  if (/^(release|hotfix)/i.test(d)) return true;
  return false;
}

/** True when the PR title or branch name carries the Jira key (e.g. "ECM-396"). */
export function mentionsTaskKey(b: BranchDeliveryInfo, jiraKey?: string): boolean {
  if (!jiraKey) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9])${jiraKey}(?![0-9])`, "i");
  return re.test(b.prTitle ?? "") || re.test(b.branch ?? "");
}

/**
 * Check if a branch has been merged into an allowed destination branch.
 *
 * Teams often merge a task's work into whichever branch they use, so a merged PR
 * whose title (or branch name) carries the task key counts as delivered no matter
 * where it was merged. The destination allow-list only applies to merged PRs that
 * do not mention the task.
 */
export function isBranchMerged(
  b: BranchDeliveryInfo,
  allowedDestinations?: string[],
  jiraKey?: string
): boolean {
  const isMerged = Boolean(b.merged) || (b.prState || "").toUpperCase() === "MERGED";
  if (!isMerged) return false;
  if (mentionsTaskKey(b, jiraKey)) return true;
  if (
    allowedDestinations &&
    allowedDestinations.length > 0 &&
    b.prDestinationBranch &&
    !isDestinationAllowed(b.prDestinationBranch, allowedDestinations)
  ) {
    return false;
  }
  return true;
}

/** Evaluate readiness for a single task and its branches. */
export function evaluateTaskReadiness(
  task: TaskReadinessInput,
  options: ReleaseReadinessOptions = {}
): TaskReadinessResult {
  const {
    noCodeLabels = getNoCodeLabels(),
    allowedDestinations,
    gitDataFresh = true,
    gitUnavailable = false,
  } = options;

  const blockers: ReleaseBlocker[] = [];
  const statusCategory = (task.statusCategory || "").trim().toLowerCase();
  const isDone = statusCategory === "done";

  if (!isDone) {
    blockers.push({
      code: "TASK_NOT_DONE",
      jiraKey: task.jiraKey,
      summary: task.summary,
      status: task.status,
    });
  }

  const noCode = isNoCodeTask(task.labels, noCodeLabels);
  let gitComplete = false;

  const branches = (task.branches || []).filter((b) => !b.deletedAt);

  if (noCode) {
    gitComplete = true;
  } else {
    if (gitUnavailable) {
      blockers.push({
        code: "GIT_UNAVAILABLE",
        jiraKey: task.jiraKey,
        summary: task.summary,
        status: task.status,
      });
      gitComplete = false;
    } else if (!gitDataFresh) {
      blockers.push({
        code: "GIT_DATA_STALE",
        jiraKey: task.jiraKey,
        summary: task.summary,
        status: task.status,
      });
      gitComplete = false;
    } else {
      const confirmedBranches = branches.filter((b) => b.linkState === "confirmed");
      const suggestedBranches = branches.filter((b) => b.linkState === "suggested");

      if (confirmedBranches.length === 0) {
        if (suggestedBranches.length > 0) {
          blockers.push({
            code: "BRANCH_LINK_UNCONFIRMED",
            jiraKey: task.jiraKey,
            summary: task.summary,
            status: task.status,
            repo: suggestedBranches[0].repo,
            branch: suggestedBranches[0].branch,
          });
        } else {
          blockers.push({
            code: "NO_CONFIRMED_BRANCH",
            jiraKey: task.jiraKey,
            summary: task.summary,
            status: task.status,
          });
        }
        gitComplete = false;
      } else {
        const mergedBranches = confirmedBranches.filter((b) => isBranchMerged(b, allowedDestinations, task.jiraKey));
        const openPrBranches = confirmedBranches.filter((b) => (b.prState || "").toUpperCase() === "OPEN");

        if (openPrBranches.length > 0) {
          // Any open PR means code changes are still actively pending merge
          for (const b of openPrBranches) {
            blockers.push({
              code: "PR_NOT_MERGED",
              jiraKey: task.jiraKey,
              summary: task.summary,
              status: task.status,
              repo: b.repo,
              branch: b.branch,
              prUrl: b.prUrl || undefined,
            });
          }
          gitComplete = false;
        } else if (mergedBranches.length > 0) {
          // At least one PR has been merged into an allowed destination and no open PRs are pending
          gitComplete = true;
        } else {
          // No branch has a merged PR into allowed destination and no open PRs exist.
          // Check if any PR was merged into an disallowed destination branch
          const wrongDestBranches = confirmedBranches.filter((b) => {
            const isMerged = Boolean(b.merged) || (b.prState || "").toUpperCase() === "MERGED";
            return (
              isMerged &&
              b.prDestinationBranch &&
              !isDestinationAllowed(b.prDestinationBranch, allowedDestinations)
            );
          });

          if (wrongDestBranches.length > 0) {
            for (const b of wrongDestBranches) {
              blockers.push({
                code: "WRONG_MERGE_DESTINATION",
                jiraKey: task.jiraKey,
                summary: task.summary,
                status: task.status,
                repo: b.repo,
                branch: b.branch,
                prUrl: b.prUrl || undefined,
              });
            }
          } else {
            // Check if any PRs existed (e.g. DECLINED or CLOSED)
            const branchesWithPr = confirmedBranches.filter(
              (b) => Boolean(b.prId != null || (b.prUrl && b.prUrl.trim()))
            );
            if (branchesWithPr.length > 0) {
              for (const b of branchesWithPr) {
                blockers.push({
                  code: "PR_NOT_MERGED",
                  jiraKey: task.jiraKey,
                  summary: task.summary,
                  status: task.status,
                  repo: b.repo,
                  branch: b.branch,
                  prUrl: b.prUrl || undefined,
                });
              }
            } else {
              // No PR created for any confirmed branch
              for (const b of confirmedBranches) {
                blockers.push({
                  code: "NO_PULL_REQUEST",
                  jiraKey: task.jiraKey,
                  summary: task.summary,
                  status: task.status,
                  repo: b.repo,
                  branch: b.branch,
                });
              }
            }
          }
          gitComplete = false;
        }
      }
    }
  }

  const ready = isDone && gitComplete;

  return {
    jiraKey: task.jiraKey,
    summary: task.summary,
    status: task.status,
    statusCategory,
    assignee: task.assignee,
    priority: task.priority,
    points: task.points,
    isDone,
    noCode,
    gitComplete,
    ready,
    blockers,
    branches,
  };
}

/** Pure evaluation of release readiness given evaluated tasks and release metadata. */
export function evaluateReleaseReadiness(
  meta: {
    jiraReleased?: boolean;
    released?: boolean;
    archived?: boolean;
    lastSyncedAt?: Date | string | null;
  },
  taskResults: TaskReadinessResult[],
  options: ReleaseReadinessOptions = {}
): ReleaseReadiness {
  const {
    jiraDataFresh = true,
    gitDataFresh = true,
    lastJiraSyncedAt = meta.lastSyncedAt ? new Date(meta.lastSyncedAt).toISOString() : null,
    lastGitSyncedAt = null,
  } = options;

  const taskCount = taskResults.length;
  const doneCount = taskResults.filter((t) => t.isDone).length;
  const gitCompleteCount = taskResults.filter((t) => t.gitComplete).length;
  const deliveryReadyCount = taskResults.filter((t) => t.ready).length;
  const blockers = taskResults.flatMap((t) => t.blockers);

  let state: ReleaseReadinessState;

  if (Boolean(meta.jiraReleased) || Boolean(meta.released)) {
    state = "released";
  } else if (taskCount === 0) {
    state = "empty";
  } else if (deliveryReadyCount === taskCount) {
    state = "ready";
  } else {
    state = "in_progress";
  }

  return {
    state,
    taskCount,
    doneCount,
    gitCompleteCount,
    deliveryReadyCount,
    blockers,
    tasks: taskResults,
    jiraDataFresh,
    gitDataFresh,
    lastJiraSyncedAt,
    lastGitSyncedAt,
  };
}

/**
 * Load release and compute full readiness using Prisma DB.
 */
export async function getReleaseReadiness(
  releaseId: string,
  options: ReleaseReadinessOptions = {}
): Promise<ReleaseReadiness | null> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: {
      tasks: {
        select: {
          jiraKey: true,
          issue: {
            select: {
              jiraKey: true,
              summary: true,
              status: true,
              statusCategory: true,
              labels: true,
              assigneeJira: true,
              priority: true,
              points: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });

  if (!release) return null;

  // Active direct tasks (deletedAt == null)
  const activeTasks = release.tasks
    .map((t) => t.issue)
    .filter((issue): issue is NonNullable<typeof issue> => issue != null && issue.deletedAt == null);

  const jiraKeys = activeTasks.map((t) => t.jiraKey);

  // Load all active branches linked to these Jira tasks
  const branchRows = await loadConfirmedBranchRows(jiraKeys);

  const branchesByKey = new Map<string, BranchDeliveryInfo[]>();
  for (const b of branchRows) {
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

  // Allowed merge destinations (e.g. from env.bitbucketBaseBranch or default)
  const allowedDestinations = options.allowedDestinations || [env.bitbucketBaseBranch, "dev", "develop", "master", "main", "prod"].filter(Boolean);

  const taskResults: TaskReadinessResult[] = activeTasks.map((issue) =>
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
      {
        ...options,
        allowedDestinations,
      }
    )
  );

  return evaluateReleaseReadiness(
    {
      jiraReleased: release.status === "released",
      released: release.status === "released",
      archived: Boolean((release as { archived?: boolean }).archived),
      lastSyncedAt: (release as { lastSyncedAt?: Date | null }).lastSyncedAt,
    },
    taskResults,
    options
  );
}
