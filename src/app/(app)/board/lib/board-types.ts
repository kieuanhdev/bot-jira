import type { BoardTransition } from "@/lib/jira/board-transitions";
import type { IssueRelationships } from "@/lib/issues/relationships";

export type Project = { key: string; openCount: number; syncEnabled?: boolean };
export type SortMode = "priority" | "updated" | "age";
export type QuickAction =
  | { kind: "assignee"; value: string | null }
  | { kind: "priority"; value: string }
  | { kind: "done" }
  | { kind: "openJira" }
  | { kind: "copyKey" }
  | { kind: "openFull" };
export type ViewMode = "board" | "list";
export type Transition = BoardTransition;

export const PRIORITY_RANK: Record<string, number> = {
  Blocker: 0,
  Highest: 1,
  High: 2,
  Medium: 3,
  Low: 4,
  Lowest: 5,
};

export const PRIORITY_META: Record<string, { rail: string; badge: string }> = {
  Blocker: { rail: "bg-rose-500", badge: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  Highest: { rail: "bg-rose-400", badge: "bg-rose-400/12 text-rose-600 dark:text-rose-400" },
  High: { rail: "bg-amber-500", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  Medium: { rail: "bg-sky-400", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-400" },
  Low: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
  Lowest: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
};
export const PRIORITY_NEUTRAL = { rail: "bg-transparent", badge: "bg-muted text-muted-foreground" };

export { AVATAR_PALETTE } from "@/lib/avatar";

export {
  CATEGORY_DOTS,
  CATEGORY_TEXT,
  CATEGORY_ORDER,
  CATEGORY_DOT_MAP,
} from "@/lib/status-style";

export type BoardSyncState = "idle" | "enqueueing" | "queued" | "running" | "succeeded" | "failed";

export type QuickPanelDetail = {
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  reporterJira: string | null;
  approverJira: string | null;
  testerJira: string | null;
  dueDate: string | null;
  timeSpentSeconds: number | null;
  originalEstimateSeconds: number | null;
  labels: string[];
  priority: string;
  points: number | null;
  type: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  aiScore: { points: number; confidence: number | null } | null;
  aiDecision: { decision: string } | null;
  staleSnapshots: { staleReason: string; severity: string; stateAgeDays: number }[];
  comments: { id: string; author: string; body: string; createdAt: string | null }[];
  releaseTasks: { release: { version: string; status: string } }[];
  fixVersions?: string[];
  relationships?: IssueRelationships;
};
