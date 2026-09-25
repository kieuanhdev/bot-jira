export type GateState = "passed" | "failed" | "unknown" | "overridden";

export type Blocker = {
  jiraKey?: string;
  source: string; // "jira" | "sentry" | "bitbucket" | "ci" | "system"
  reason: string;
  url?: string;
};

export type GateResult = {
  gate: string;
  state: GateState;
  summary: string;
  blockers: Blocker[];
  sourceTime?: Date;
  details?: Record<string, unknown>;
};

export type ReleaseContext = {
  releaseId: string;
  version: string;
  projectKey: string;
  tasks: TaskInfo[];
  branchInfos: BranchInfoRow[];
  /**
   * Unresolved Sentry issues for the release scope. `null` (as opposed to `[]`)
   * means the source could not be read — the sentry gate then reports
   * `unknown` instead of `passed`.
   */
  sentryIssues: SentryIssueInfo[] | null;
  /** Last time the Sentry source was verified; null when it could not be read. */
  sentryCheckedAt: Date | null;
  /** REL-03 — required approval types; empty means no manual approval gate. */
  requiredApprovals?: string[];
  /** REL-03 — which required approvals are currently present (not revoked). */
  approvalsPresent?: { type: string; present: boolean }[];
  /** REL-04 — latest CI build states for the release's commits (empty = none). */
  ciBuilds?: CiBuildState[];
  /** REL-04 — when true the CI gate is mandatory; default off. */
  ciGateEnabled?: boolean;
  /** DEP-09/10 — dependency graph metadata for the release scope. */
  dependencyGraph?: {
    cycles: Array<{ path: string[] }>;
    truncated: boolean;
    missingKeys: string[];
  };
  checkedAt: Date;
};

export type CiBuildState = {
  provider: string;
  commitSha: string;
  status: string; // pending | success | failed | cancelled
  testStatus: string | null;
  url: string | null;
  completedAt: Date | null;
  /** The commit the release expects to be checked against. */
  expectedCommitSha: string | null;
};

export type TaskInfo = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  issueType: string;
  lastSyncedAt: Date;
  inclusion?: "direct" | "dependency";
  rootKeys?: string[];
  depth?: number;
  sameProject?: boolean;
  hasReleaseVersion?: boolean;
  projectKey?: string;
};

export type BranchInfoRow = {
  repo: string;
  branch: string;
  prState: string | null;
  prDestinationBranch: string | null;
  merged: boolean;
  checkedAt: Date;
};

export type SentryIssueInfo = {
  id: string;
  shortId: string;
  title: string;
  level: string;
  status: string;
  permalinkUrl?: string;
};
