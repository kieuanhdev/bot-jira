import type { JiraClient } from "@/lib/jira/client";
import type { JiraIssue } from "@/lib/jira/types";
import type { notifyWatchersOfIssueChange } from "@/lib/issues/notify-watchers";

export const JIRA_SYNC_MAX_PAGES = 150;
export const JIRA_SYNC_PAGE_SIZE = 50;

export type JiraSyncSource = "schedule" | "manual" | "startup" | "admin" | "recovery";

export type PollJiraProjectJobData = {
  projectKey: string;
  full: boolean;
  source: JiraSyncSource;
  requestedBy?: string;
  requestedAt: string;
};

export type PollJiraJobData = {
  projectKey?: string;
  full?: boolean;
  requestedBy?: string;
  source?: JiraSyncSource;
  requestedAt?: string;
};

export type ProjectStats = {
  projectKey: string;
  created: number;
  updated: number;
  comments: number;
  deleted: number;
  pages: number;
  cursor: string | null;
  errors: string[];
  cursorAdvanced?: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  workflowStatusCount?: number;
  workflowRefreshError?: string | null;
};

export type JiraSyncCursor = {
  id: string;
  cursor: string | null;
  lastSuccessAt: Date | null;
};

export type JiraSyncClient = Pick<
  JiraClient,
  "search" | "getComments" | "getProjectStatuses"
>;

export type PreviousIssue = NonNullable<
  Parameters<typeof notifyWatchersOfIssueChange>[0]
>;

export type JiraSyncPage = {
  issues: JiraIssue[];
  total: number;
};

export type LoadedJiraSync = {
  current: JiraSyncCursor;
  validCursor: Date | null;
  jql: string;
  isFullScan: boolean;
  stats: ProjectStats;
};

export type PersistPageResult = {
  newestUpdatedAt: Date | null;
};

export type FinalizeRunInput = {
  current: JiraSyncCursor;
  projectKey: string;
  runToken: string;
  cursor: string | null;
  cursorAdvanced: boolean;
  isFullScan: boolean;
  hasErrors: boolean;
  exhaustedAllPages: boolean;
  aborted: boolean;
  seenKeys: Set<string>;
  stats: ProjectStats;
};

export type FinalizeRunResult = {
  deleted: number;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type JiraSyncDependencies = {
  now: () => Date;
  overlapSeconds: number;
  claimLease: (
    projectKey: string,
    runToken: string,
    expiresAt: Date
  ) => Promise<JiraSyncCursor>;
  renewLease: (projectKey: string, runToken: string, expiresAt: Date) => Promise<void>;
  releaseLease: (projectKey: string, runToken: string) => Promise<boolean>;
  buildJql: (projectKey: string, since?: Date) => string;
  loadPeopleFields: (projectKey: string) => Promise<Record<string, string | null>>;
  findPreviousIssues: (keys: string[]) => Promise<PreviousIssue[]>;
  upsertIssue: typeof import("@/lib/issues/cache").upsertJiraIssue;
  upsertComments: typeof import("@/lib/issues/cache").upsertJiraCommentsWithNew;
  notifyIssue: typeof import("@/lib/issues/notify-watchers").notifyWatchersOfIssueChange;
  notifyComment: typeof import("@/lib/issues/notify-watchers").notifyWatchersOfComment;
  parseDate: (value?: string | null) => Date | undefined;
  saveWorkflowSnapshot: (
    projectKey: string,
    statuses: Array<{ id: string; name: string; category?: string }>
  ) => Promise<{ statusCount: number }>;
  finalizeRun: (input: FinalizeRunInput) => Promise<FinalizeRunResult>;
  recordError: (
    cursorId: string,
    runToken: string,
    message: string,
    stats: ProjectStats
  ) => Promise<void>;
  warn: (message: string, detail: string) => void;
};

export function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
