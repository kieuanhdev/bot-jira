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
  checkedAt: Date;
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
