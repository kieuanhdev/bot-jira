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

export {
  PRIORITIES,
  type PriorityName,
  PRIORITY_RANK,
  PRIORITY_META,
  PRIORITY_NEUTRAL,
  isHighPriority,
  getPriorityRank,
} from "@/lib/jira/priority";

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
