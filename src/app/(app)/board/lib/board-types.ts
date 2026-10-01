import type { BoardTransition } from "@/lib/jira/board-transitions";

export type Project = { key: string; openCount: number };
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

export const AVATAR_PALETTE = [
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

export const CATEGORY_DOTS: Record<string, string[]> = {
  new: ["bg-sky-400", "bg-cyan-500", "bg-blue-400", "bg-indigo-400", "bg-teal-400", "bg-sky-600", "bg-cyan-400", "bg-blue-500"],
  indeterminate: ["bg-primary", "bg-cyan-500", "bg-sky-600", "bg-blue-500", "bg-indigo-500", "bg-primary/70"],
  done: ["bg-emerald-500", "bg-green-500", "bg-teal-500", "bg-lime-500", "bg-emerald-400", "bg-green-400"],
};
export const CATEGORY_TEXT: Record<string, string> = {
  new: "text-sky-600 dark:text-sky-400",
  indeterminate: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
};

export const CATEGORY_ORDER = ["new", "indeterminate", "done"] as const;

export const CATEGORY_DOT_MAP: Record<string, string> = {
  new: "bg-slate-400",
  indeterminate: "bg-amber-400",
  done: "bg-emerald-500",
};

export type BoardSyncState = "idle" | "enqueueing" | "queued" | "running" | "succeeded" | "failed";

export type QuickPanelDetail = {
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
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
};
