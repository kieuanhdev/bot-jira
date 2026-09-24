"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError } from "@/lib/api-client";
import { useIssues, fetchIssuesPage, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, meKeys, transitionsKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timeAgo, formatDateTime } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type BoardWidth } from "@/lib/status-groups";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Bot,
  ListFilter,
  LayoutGrid,
  List,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  Copy,
  User,
  Flag,
  X,
  CornerDownLeft,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Send,
  Check,
  GitBranch,
} from "lucide-react";

type Project = { key: string; openCount: number };
type SortMode = "priority" | "updated" | "age";
type QuickAction =
  | { kind: "assignee"; value: string | null }
  | { kind: "priority"; value: string }
  | { kind: "done" }
  | { kind: "openJira" }
  | { kind: "copyKey" }
  | { kind: "openFull" };
type ViewMode = "board" | "list";
type Transition = { id: string; to?: { name?: string } | string };

const PRIORITY_RANK: Record<string, number> = {
  Blocker: 0,
  Highest: 1,
  High: 2,
  Medium: 3,
  Low: 4,
  Lowest: 5,
};

function daysSince(d: string | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

/** Sort a column's issues. `age` = oldest first, `updated` = most recent first. */
function sortIssues(items: IssueItem[], mode: SortMode): IssueItem[] {
  const arr = [...items];
  if (mode === "priority") {
    arr.sort((a, b) => {
      const ra = PRIORITY_RANK[a.priority] ?? 9;
      const rb = PRIORITY_RANK[b.priority] ?? 9;
      if (ra !== rb) return ra - rb;
      return daysSince(b.updatedAt) - daysSince(a.updatedAt);
    });
  } else if (mode === "updated") {
    arr.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
  } else {
    arr.sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt));
  }
  return arr;
}

/** Visuals per priority: a colored left rail + a soft badge. Higher = stronger. */
const PRIORITY_META: Record<string, { rail: string; badge: string }> = {
  Blocker: { rail: "bg-rose-500", badge: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  Highest: { rail: "bg-rose-400", badge: "bg-rose-400/12 text-rose-600 dark:text-rose-400" },
  High: { rail: "bg-amber-500", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  Medium: { rail: "bg-sky-400", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-400" },
  Low: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
  Lowest: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
};
const PRIORITY_NEUTRAL = { rail: "bg-transparent", badge: "bg-muted text-muted-foreground" };

function priorityMeta(priority: string) {
  return PRIORITY_META[priority] ?? PRIORITY_NEUTRAL;
}

/** Deterministic avatar palette keyed by name (stable, no hashing lib needed). */
const AVATAR_PALETTE = [
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

function avatarClass(name: string | null | undefined): string {
  if (!name) return "bg-muted text-muted-foreground";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Shorten a Jira issue type for the key-row chip. */
function typeShort(type: string): string {
  const t = type.trim();
  const map: Record<string, string> = {
    "Story": "Story", "Task": "Task", "Bug": "Bug",
    "Sub-task": "Sub", "Sub Task": "Sub", "Subtask": "Sub",
    "Epic": "Epic", "Sprint Goal": "Goal",
    "Test": "Test", "Test Case": "Test", "Risk": "Risk",
  };
  return map[t] ?? t.slice(0, 4);
}

/**
 * Status color per Jira status category key (stable across instances). Colors
 * are grouped into 3 families — to-do (sky), in-progress (teal), done
 * (emerald) — and *within* a family each status gets a distinct shade so two
 * columns of the same category never look identical.
 */
const CATEGORY_DOTS: Record<string, string[]> = {
  new: ["bg-sky-400", "bg-cyan-500", "bg-blue-400", "bg-indigo-400", "bg-teal-400", "bg-sky-600", "bg-cyan-400", "bg-blue-500"],
  indeterminate: ["bg-primary", "bg-cyan-500", "bg-sky-600", "bg-blue-500", "bg-indigo-500", "bg-primary/70"],
  done: ["bg-emerald-500", "bg-green-500", "bg-teal-500", "bg-lime-500", "bg-emerald-400", "bg-green-400"],
};
const CATEGORY_TEXT: Record<string, string> = {
  new: "text-sky-600 dark:text-sky-400",
  indeterminate: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
};
/** Distinct dot per (category, position-within-category); stable by index. */
function statusDot(category: string, idxInCategory: number): string {
  const arr = CATEGORY_DOTS[category] ?? CATEGORY_DOTS.new;
  return arr[idxInCategory % arr.length];
}
function statusText(category: string): string {
  return CATEGORY_TEXT[category] ?? CATEGORY_TEXT.new;
}

/** Column order matches Jira's to-do → in-progress → done. */
const CATEGORY_ORDER = ["new", "indeterminate", "done"] as const;

/**
 * Route an issue to a board column.
 * 1. Exact status-name match against the project's real columns (preferred —
 *    this is what makes "Backlog" vs "Selected for Development" split into
 *    separate columns like the Jira board).
 * 2. Fallback: the issue's status category (from the cache, or the workflow
 *    status → category map), which picks the first column of that category.
 */
function columnKeyForIssue(
  issue: IssueItem,
  columnKeyByStatus: Map<string, string>,
  statusCategoryMap: Record<string, string>,
  columns: { key: string; category: string }[]
): string {
  const byName = columnKeyByStatus.get(issue.status);
  if (byName) return byName;
  const cat = issue.statusCategory || statusCategoryMap[issue.status] || "new";
  const col = columns.find((c) => c.category === cat) ?? columns[0];
  return col ? col.key : "To Do";
}

function CardContent({
  issue,
  done,
  dragging,
  onTransition,
  colIndex,
  columnCount,
  showNav,
  onQuickAction,
  assignees,
}: {
  issue: IssueItem;
  done: boolean;
  dragging?: boolean;
  onTransition?: (key: string, target: string) => void;
  colIndex?: number;
  columnCount?: number;
  showNav?: boolean;
  onQuickAction?: (key: string, action: QuickAction) => void;
  assignees?: string[];
}) {
  const stale = daysSince(issue.updatedAt) >= 7 && !done;
  const pm = priorityMeta(issue.priority || "");
  const canPrev = (colIndex ?? 0) > 0;
  const canNext = (colIndex ?? 0) < (columnCount ?? 0) - 1;
  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all duration-150",
        dragging
          ? "border-primary/50 shadow-lg ring-2 ring-primary/25"
          : "border-border/70 shadow-sm hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", pm.rail)} aria-hidden />
      <div className="py-2 pl-3.5 pr-2.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground">{issue.jiraKey}</span>
          {issue.type && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {typeShort(issue.type)}
            </span>
          )}
          <span className="ml-auto shrink-0" />
          {issue.points != null && (
            <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-secondary px-1.5 font-mono text-[10px] font-semibold tabular-nums text-secondary-foreground">
              {issue.points}
            </span>
          )}
          {onQuickAction && !dragging && (
            <DropdownMenu>
              <DropdownMenuTrigger
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-label={`Actions for ${issue.jiraKey}`}
                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" onPointerDown={(e) => e.stopPropagation()}>
                <DropdownMenuLabel className="font-mono text-xs">{issue.jiraKey}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "assignee", value: null }); }}
                    className="gap-2"
                  >
                    <User className="h-3.5 w-3.5" aria-hidden /> Unassign
                  </DropdownMenuItem>
                  {assignees && assignees.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                      {assignees.slice(0, 12).map((a) => (
                        <DropdownMenuItem
                          key={a}
                          onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "assignee", value: a }); }}
                          className="gap-2"
                        >
                          {a === issue.assigneeJira && <span className="text-primary">•</span>}
                          <span className="truncate">{a}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Priority</DropdownMenuLabel>
                  {priorities.map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "priority", value: p }); }}
                      className="gap-2"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden />
                      <span>{p}</span>
                      {p === issue.priority && <span className="ml-auto text-primary">•</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {!done && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "done" }); }} className="gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Mark done
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "copyKey" }); }} className="gap-2">
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy key
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "openJira" }); }} className="gap-2">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open in Jira
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "openFull" }); }} className="gap-2">
                  <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> Open full detail
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-card-foreground">
          {issue.summary}
        </p>

        {(issue.aiScore || stale || (issue.delivery && issue.delivery.branchCount > 0)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {issue.delivery && issue.delivery.branchCount > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "h-4 gap-1 px-1.5 text-[10px] font-mono",
                  issue.delivery.prMerged
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : issue.delivery.prOpen
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                )}
                title={`${issue.delivery.branchCount} branch liên kết${issue.delivery.prMerged ? " • PR merged" : issue.delivery.prOpen ? " • PR open" : ""}`}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {issue.delivery.branchCount}b
                {issue.delivery.prMerged ? " ✓" : issue.delivery.prOpen ? " PR" : ""}
              </Badge>
            )}
            {issue.aiScore && (
              <Badge
                variant={issue.aiDecision ? (issue.aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
                className="h-4 gap-1 px-1.5 text-[10px]"
                title={issue.aiDecision ? `AI estimate ${issue.aiDecision.decision}` : "AI estimate (pending review)"}
              >
                <Bot className="h-2.5 w-2.5" />
                {issue.aiScore.points}pt
                {issue.aiScore.confidence != null ? ` ${Math.round(issue.aiScore.confidence * 100)}%` : ""}
              </Badge>
            )}
            {stale && (
              <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]" title="Stale — not updated in 7+ days">
                <Clock className="h-2.5 w-2.5" />
                {daysSince(issue.updatedAt)}d
              </Badge>
            )}
            {issue.priority && issue.priority !== "Low" && issue.priority !== "Lowest" && (
              <span className={cn("inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-semibold", pm.badge)}>
                {issue.priority}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          {issue.assigneeJira ? (
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                avatarClass(issue.assigneeJira)
              )}
              title={issue.assigneeJira}
            >
              {initials(issue.assigneeJira)}
            </span>
          ) : (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground/60"
              title="Unassigned"
              aria-label="Unassigned"
            >
              –
            </span>
          )}
          <span className="truncate text-[11px] text-muted-foreground">{timeAgo(issue.updatedAt)}</span>
          {showNav && onTransition && !done && (
            <span className="ml-auto flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransition(issue.jiraKey, "__prev__"); }}
                disabled={!canPrev}
                aria-label="Move to previous column"
                title="Move left"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransition(issue.jiraKey, "__next__"); }}
                disabled={!canNext}
                aria-label="Move to next column"
                title="Move right"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableCard({
  issue,
  done,
  colIndex,
  columnCount,
  onTransition,
  busy,
  dndDisabled,
  showNavButtons,
  onOpen,
  onQuickAction,
  assignees,
  registerRef,
  focused,
}: {
  issue: IssueItem;
  done: boolean;
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
  showNavButtons: boolean;
  onOpen?: (issue: IssueItem) => void;
  onQuickAction?: (key: string, action: QuickAction) => void;
  assignees?: string[];
  registerRef?: (key: string, el: HTMLElement | null) => void;
  focused?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.jiraKey,
    disabled: dndDisabled,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef?.(issue.jiraKey, el);
      }}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative rounded-lg outline-none transition-shadow duration-150",
        !dndDisabled && !isDragging && "cursor-grab active:cursor-grabbing",
        isDragging && "z-10 opacity-40",
        focused && "ring-2 ring-ring/70 ring-offset-1 ring-offset-background"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen?.(issue)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen?.(issue);
          }
        }}
        className={cn(
          "block w-full rounded-lg text-left outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        )}
      >
        <CardContent
          issue={issue}
          done={done}
          onTransition={busy ? undefined : onTransition}
          colIndex={colIndex}
          columnCount={columnCount}
          showNav={showNavButtons && !dndDisabled}
          onQuickAction={onQuickAction}
          assignees={assignees}
        />
      </div>
    </div>
  );
}

function BoardColumn({
  id,
  label,
  category,
  isDone,
  items,
  total,
  colIndex,
  columnCount,
  onTransition,
  busy,
  dndDisabled,
  onOverChange,
  dotColor,
  dragBlocked,
  optimistic,
  wipOver,
  collapsed,
  onGrow,
  onToggleCollapse,
  onOpen,
  onQuickAction,
  assignees,
  registerRef,
  focusKey,
}: {
  id: string;
  label: string;
  category: string;
  isDone: boolean;
  items: IssueItem[];
  total: number;
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
  onOverChange: (over: boolean) => void;
  dotColor: string;
  /** True while dragging a card that the workflow cannot move into this column. */
  dragBlocked?: boolean;
  /** issueKey -> target status for in-flight optimistic moves. */
  optimistic: Map<string, string>;
  wipOver: boolean;
  collapsed: boolean;
  onGrow: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onOpen: (issue: IssueItem) => void;
  onQuickAction: (key: string, action: QuickAction) => void;
  assignees: string[];
  registerRef: (key: string, el: HTMLElement | null) => void;
  focusKey: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const text = statusText(category);
  const hasMore = items.length < total;

  useEffect(() => {
    onOverChange(isOver);
    // onOverChange is a stable setState callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 py-1">
        <button
          onClick={() => onToggleCollapse(id)}
          title={`Mở cột ${label}`}
          aria-label={`Mở cột ${label}`}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-1 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{total}</span>
          <span
            className="text-[10px] font-semibold tracking-tight"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {label}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 basis-72 flex-col">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotColor)} />
        <span className={cn("min-w-0 truncate text-[13px] font-semibold tracking-tight", text)}>{label}</span>
        {wipOver && (
          <span
            className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
            title="Nhiều task đang chạy hơn mức khuyến nghị (WIP)"
          >
            WIP
          </span>
        )}
        {dragBlocked ? (
          <span className="ml-auto shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
            Không cho
          </span>
        ) : (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {total}
          </span>
        )}
        <button
          onClick={() => onToggleCollapse(id)}
          title={`Thu gọn cột ${label}`}
          aria-label={`Thu gọn cột ${label}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex flex-1 flex-col overflow-hidden rounded-xl border transition-colors duration-150",
          dragBlocked
            ? "border-rose-400/50 bg-rose-500/10"
            : isOver
              ? "border-primary/40 bg-primary/10"
              : "border-border/60 bg-muted/25"
        )}
      >
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-80", dragBlocked ? "bg-rose-400" : dotColor)} aria-hidden />
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-width:thin]">
          {items.length === 0 ? (
            <div
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-[11px] transition-colors",
                isOver ? "border-primary/50 bg-primary/5 text-primary" : "border-border/70 text-muted-foreground/70"
              )}
            >
              {isOver ? "Thả task vào đây" : "Không có task"}
            </div>
          ) : (
            <>
              {items.map((issue) => {
                const pending = optimistic.has(issue.jiraKey);
                const shown = pending
                  ? ({ ...issue, status: optimistic.get(issue.jiraKey)! } as IssueItem)
                  : issue;
                return (
                  <div key={issue.jiraKey} className="relative">
                    {pending && (
                      <span
                        className="absolute right-1.5 top-1.5 z-10 h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
                        title="Đang cập nhật Jira…"
                        aria-label="Đang cập nhật Jira"
                      />
                    )}
                    <DraggableCard
                      issue={shown}
                      done={isDone}
                      colIndex={colIndex}
                      columnCount={columnCount}
                      onTransition={onTransition}
                      busy={busy}
                      dndDisabled={dndDisabled}
                      showNavButtons
                      onOpen={() => onOpen(shown)}
                      onQuickAction={onQuickAction}
                      assignees={assignees}
                      registerRef={registerRef}
                      focused={focusKey === issue.jiraKey}
                    />
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => onGrow(id)}
                  className="rounded-lg border border-dashed border-border/70 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  Xem thêm {total - items.length}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2 shadow-sm transition-shadow duration-150 hover:shadow-md">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function BoardSkeleton({ columnCount }: { columnCount: number }) {
  const count = Math.max(3, Math.min(columnCount, 6));
  return (
    <div className="flex flex-1 gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, g) => (
        <div key={g} className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Card key={row} className="p-2.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-24" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoardClient() {
  const qc = useQueryClient();
  const router = useRouter();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [activeDrag, setActiveDrag] = useState<IssueItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // While a card is dragged over a column, auto-scroll the board horizontally
  // so off-screen columns can be reached and dropped on.
  useEffect(() => {
    if (!activeDrag || !dragOverCol) return;
    let raf = 0;
    const tick = () => {
      const el = boardScrollRef.current;
      if (el) {
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        if (el.scrollLeft <= 1) el.scrollLeft += 16;
        else if (atEnd) el.scrollLeft -= 16;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeDrag, dragOverCol]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: projects } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Project[] }>("/api/projects"),
    refetchInterval: 30000,
    retry: 0,
  });
  const allProjects = useMemo(() => projects?.items ?? [], [projects?.items]);

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () =>
      api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    retry: 0,
  });
  const myName = meStatus?.jiraName ?? null;
  const jiraBaseUrl = meStatus?.jiraBaseUrl ?? "";

  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    retry: 0,
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[] | null>(null);

  const preferred = useMemo(() => prefs?.projects ?? [], [prefs?.projects]);
  const availableKeys = useMemo(() => prefs?.available ?? [], [prefs?.available]);

  const [project, setProject] = useState<string>("");

  const savePrefs = useCallback(async (next: string[]) => {
    await api("/api/me/preferences", { method: "PUT", body: { projects: next } });
    await Promise.all([
      qc.invalidateQueries({ queryKey: meKeys.prefs }),
      qc.invalidateQueries({ queryKey: boardKeys.projects }),
    ]);
    setProject((prev) => (next.length > 0 && (!prev || !next.includes(prev)) ? next[0] : prev));
  }, [qc]);

  // First visit: if the user has never chosen projects (empty prefs), treat
  // every available project as selected so the board shows something
  // immediately instead of a blank "No projects" screen. The empty array is
  // only shown while prefs are still loading.
  const effectivePreferred = useMemo(
    () => (preferred.length === 0 ? availableKeys : preferred),
    [preferred, availableKeys]
  );

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allProjects) m.set(p.key, p.openCount);
    return m;
  }, [allProjects]);
  const projectList = useMemo(
    () =>
      effectivePreferred
        .filter((k) => availableKeys.includes(k))
        .map((k) => ({ key: k, openCount: countMap.get(k) ?? 0 })),
    [effectivePreferred, countMap, availableKeys]
  );

  // Picker uses local state while open; only commits on "Done"
  const pickerActive = pickerSelection ?? effectivePreferred;
  const pickerSet = new Set(pickerActive);

  function openPicker() {
    setPickerSelection(effectivePreferred);
    setShowPicker(true);
  }

  function closePicker() {
    setShowPicker(false);
    setPickerSelection(null);
  }

  function commitPicker() {
    if (pickerSelection) savePrefs(pickerSelection);
    closePicker();
  }

  function togglePicker(key: string) {
    setPickerSelection((prev) => {
      const base = prev ?? effectivePreferred;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  }
  const [view, setView] = useState<ViewMode>("board");
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState<string>("me");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [quickPanel, setQuickPanel] = useState<IssueItem | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const selectedProject = effectivePreferred.includes(project) ? project : (effectivePreferred[0] ?? "");

  // Bounded render (#2): how many cards each column shows before "load more".
  // Stored as { sig, counts } so a change to the visible set / sort / project
  // resets the counters automatically (checked during render below, no effect).
  const [colVisibleState, setColVisibleState] = useState<{ sig: string; counts: Record<string, number> }>({
    sig: "",
    counts: {},
  });
  const COL_BATCH = 40;

  const [width, setWidth] = useState<BoardWidth>("wide");
  useEffect(() => {
    function measure() {
      const w = window.innerWidth;
      setWidth(w >= 1280 ? "wide" : w >= 768 ? "medium" : "narrow");
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const effectiveView: ViewMode = width === "narrow" ? "list" : view;

  const enabled = effectivePreferred.length > 0;
  const boardFilters: import("@/hooks/use-issues").BoardFilters = {
    ...(selectedProject ? { project: selectedProject } : {}),
    q: q || undefined,
    label: label || undefined,
    priority: priority || undefined,
    assignee,
    includeDone: true,
    limit: 1000,
  };
  const { data, isLoading, isFetching } = useIssues(boardFilters, { enabled });

  // Extra pages loaded on demand for projects larger than the first page. The
  // filter signature is the key that resets them: when it changes, the loaded
  // pages no longer match, so we only render the first page until reloaded.
  const filterSig = JSON.stringify({ p: selectedProject, q, label, priority, assignee });
  const [extraPages, setExtraPages] = useState<{ sig: string; items: IssueItem[] }>({ sig: "", items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedTotal = data?.total ?? 0;

  const extraIssues = useMemo(
    () => (extraPages.sig === filterSig ? extraPages.items : []),
    [extraPages, filterSig]
  );
  const firstPageCount = data?.items.length ?? 0;
  const hasMore = firstPageCount + extraIssues.length < loadedTotal;

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const sig = filterSig;
    try {
      const offset = firstPageCount + extraIssues.length;
      const page = await fetchIssuesPage(boardFilters, offset, 1000);
      setExtraPages((prev) => {
        const base = prev.sig === sig ? prev.items : [];
        return { sig, items: [...base, ...page.items] };
      });
    } catch (e) {
      setToast(`Couldn't load more tasks: ${(e as Error).message.slice(0, 80)}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const issues = useMemo(
    () => (data?.items ?? []).concat(extraIssues),
    [data?.items, extraIssues]
  );
  const [syncQueued, setSyncQueued] = useState(false);

  async function syncJira() {
    setSyncQueued(true);
    try {
      await api("/api/sync/jira", {
        method: "POST",
        body: selectedProject ? { projectKey: selectedProject } : {},
      });
      setToast("Jira sync queued. The board will refresh automatically.");
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: issuesKeys.all });
        void qc.invalidateQueries({ queryKey: boardKeys.projects });
        setSyncQueued(false);
      }, 1500);
    } catch (error) {
      setToast(`Could not queue Jira sync: ${(error as Error).message.slice(0, 100)}`);
      setSyncQueued(false);
    }
  }

  const { data: optData } = useQuery({
    queryKey: issuesKeys.filters(selectedProject),
    enabled: effectivePreferred.length > 0,
    queryFn: () =>
      api<{ assignees: string[]; labels: string[]; priorities: string[] }>(
        `/api/issues/filters?project=${selectedProject}`
      ),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const assignees = optData?.assignees ?? [];
  const labelOptions = optData?.labels ?? [];

  // Command palette (Cmd/Ctrl+K): jump to any issue on the board by key or
  // summary. Filters the already-loaded issues; Enter opens its detail page.
  const paletteResults = useMemo(() => {
    const needle = paletteQ.trim().toLowerCase();
    if (!needle) return issues.slice(0, 8);
    return issues
      .filter(
        (i) =>
          i.jiraKey.toLowerCase().includes(needle) ||
          (i.summary ?? "").toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [issues, paletteQ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((open) => {
          const next = !open;
          if (next) setPaletteQ("");
          return next;
        });
      } else if (e.key === "Escape" && (paletteOpen || quickPanel)) {
        setPaletteOpen(false);
        setQuickPanel(null);
      }
      // Ignore the rest while typing in a field.
      if (typing) return;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, quickPanel]);

  // Dynamic columns from the project's real Jira workflow (grouped by status
  // category). Falls back to the 3 default category columns if the endpoint is
  // empty (Jira not configured / error). Column identity = category key, so an
  // issue routes by its category, not by a fragile status-name match.
  const { data: statusesData } = useQuery({
    queryKey: boardKeys.statuses(selectedProject),
    enabled: effectivePreferred.length > 0 && Boolean(selectedProject),
    queryFn: () =>
      api<{
        items: { name: string; category: string }[];
        statusCategoryMap: Record<string, string>;
      }>(`/api/board/statuses?project=${selectedProject}`),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const statusCategoryMap = useMemo<Record<string, string>>(
    () => statusesData?.statusCategoryMap ?? {},
    [statusesData?.statusCategoryMap]
  );

  type Column = { key: string; label: string; category: string; isDone: boolean };
  const columns = useMemo<Column[]>(() => {
    const items = statusesData?.items ?? [];
    if (items.length === 0) {
      return [
        { key: "To Do", label: "To Do", category: "new", isDone: false },
        { key: "In Progress", label: "In Progress", category: "indeterminate", isDone: false },
        { key: "Done", label: "Done", category: "done", isDone: true },
      ];
    }
    // One column per workflow status (the project's real workflow / manual
    // columns), in the order Jira reports them. Column identity = the status
    // name; its category (new/indeterminate/done) drives color + the done
    // accent, and is what an issue routes to when its own statusCategory is
    // unknown.
    const seen = new Set<string>();
    const cols: Column[] = [];
    for (const s of items) {
      const label = (s.name || "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      const cat =
        typeof s.category === "string" && CATEGORY_ORDER.includes(s.category as (typeof CATEGORY_ORDER)[number])
          ? s.category
          : "new";
      cols.push({ key: label, label, category: cat, isDone: cat === "done" });
    }
    return cols.length > 0
      ? cols
      : [
          { key: "To Do", label: "To Do", category: "new", isDone: false },
          { key: "In Progress", label: "In Progress", category: "indeterminate", isDone: false },
          { key: "Done", label: "Done", category: "done", isDone: true },
        ];
  }, [statusesData?.items]);

  // Optimistic card moves: issueKey -> status name we're moving it to. Applied
  // instantly so the card lands in the new column the moment you drop it, before
  // Jira confirms. Cleared on success (refetch reconciles) or failure (revert).
  const [optimistic, setOptimistic] = useState<Map<string, string>>(new Map());

  function setOptimisticStatus(key: string, status: string | null) {
    setOptimistic((prev) => {
      const next = new Map(prev);
      if (status === null) next.delete(key);
      else next.set(key, status);
      return next;
    });
  }

  // Map an issue to the column that carries its status name.
  const columnKeyByStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) m.set(c.label, c.key);
    return m;
  }, [columns]);

  // Route an issue to its column, honoring any in-flight optimistic move.
  function findColumnForIssue(issue: IssueItem): string {
    const effective = optimistic.has(issue.jiraKey)
      ? ({ ...issue, status: optimistic.get(issue.jiraKey)! } as IssueItem)
      : issue;
    return columnKeyForIssue(effective, columnKeyByStatus, statusCategoryMap, columns);
  }

  const byColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const c of columns) m.set(c.key, []);
    for (const issue of issues) {
      const col = findColumnForIssue(issue);
      const bucket = m.get(col);
      if (bucket) bucket.push(issue);
    }
    return m;
    // findColumnForIssue closes over the same values listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, columns, columnKeyByStatus, statusCategoryMap, optimistic]);

  // Each column's issues, sorted by the selected mode.
  const sortedByColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const [k, v] of byColumn) m.set(k, sortIssues(v, sortMode));
    return m;
  }, [byColumn, sortMode]);

  const summary = useMemo(() => {
    let inProgress = 0;
    let done = 0;
    let stale = 0;
    for (const c of columns) {
      const items = byColumn.get(c.key) ?? [];
      if (c.category === "indeterminate") inProgress += items.length;
      if (c.category === "done") done += items.length;
      if (c.category !== "done") stale += items.filter((i) => daysSince(i.updatedAt) >= 7).length;
    }
    return { inProgress, stale, done, open: issues.length - done };
  }, [columns, byColumn, issues]);

  const activeProject = projectList.find((p) => p.key === selectedProject) ?? null;

  const columnKeys = useMemo(() => columns.map((c) => c.key), [columns]);

  const transitionCache = useRef(new Map<string, Transition[]>());
  // While dragging, the set of column keys the active card can legally move to.
  const [allowedCols, setAllowedCols] = useState<Set<string> | null>(null);

  function toName(tr: Transition): string {
    return typeof tr.to === "string" ? tr.to : tr.to?.name ?? "";
  }

  async function fetchTransitions(key: string, force = false) {
    if (!force && transitionCache.current.has(key)) {
      return transitionCache.current.get(key)!;
    }
    const t = await api<{ transitions: Transition[] }>(`/api/issues/${key}/transitions`);
    transitionCache.current.set(key, t.transitions);
    return t.transitions;
  }

  function invalidateTransitionCache(key: string) {
    transitionCache.current.delete(key);
  }

  // Preload each visible issue's available transitions once so drag-over can
  // validate drop targets instantly (no per-hover request). Re-runs when the
  // visible set changes (new filter, a successful move, a fresh poll).
  const transitionKeys = useMemo(() => issues.map((i) => i.jiraKey).join("|"), [issues]);
  useEffect(() => {
    const keys = transitionKeys ? transitionKeys.split("|") : [];
    let cancelled = false;
    (async () => {
      for (const key of keys) {
        if (cancelled || transitionCache.current.has(key)) continue;
        try {
          const t = await api<{ transitions: Transition[] }>(`/api/issues/${key}/transitions`);
          if (!cancelled) transitionCache.current.set(key, t.transitions);
        } catch {
          // Leave it uncached; the lazy path fetches on demand instead.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transitionKeys]);

  /**
   * Can an issue legally transition into `targetLabel`? Exact status-name match
   * first; for the 3-column fallback layout (a column is a whole category) any
   * transition into that category counts.
   */
  function canDropTo(
    all: Transition[],
    targetLabel: string,
    targetCat: string | undefined,
    targetKey: string
  ): boolean {
    if (all.some((tr) => toName(tr).toLowerCase().trim() === targetLabel.toLowerCase().trim())) {
      return true;
    }
    if (targetCat && targetKey !== targetLabel) {
      return all.some((tr) => {
        const t = toName(tr);
        return (statusCategoryMap[t] ?? statusCategoryMap[t.toLowerCase()]) === targetCat;
      });
    }
    return false;
  }

  /**
   * Find a transition that lands in the target column. A column is a specific
   * workflow status, so the primary match is an exact status-name match. The
   * fallback accepts any transition whose target status shares the column's
   * category (covers the 3-column fallback layout, where a column is a category
   * like "To Do"/"In Progress"/"Done" rather than a single status).
   */
  function findTransition(all: Transition[], targetLabel: string): Transition | null {
    const exact = all.find((tr) => {
      const n = toName(tr).toLowerCase().trim();
      return n === targetLabel.toLowerCase().trim();
    });
    if (exact) return exact;
    const targetCat = columns.find((c) => c.key === targetLabel)?.category;
    if (targetCat) {
      const byCat = all.find((tr) => {
        const target = toName(tr);
        const cat = statusCategoryMap[target] ?? statusCategoryMap[target.toLowerCase()];
        return cat === targetCat;
      });
      if (byCat) return byCat;
    }
    return null;
  }

  async function doTransition(key: string, transitionId: string, revertTo: string | null = null) {
    try {
      await api(`/api/issues/${key}/transition`, {
        method: "POST",
        body: { transitionId },
      });
    } catch (e) {
      const status = (e as ApiError)?.status ?? null;
      // Revert the optimistic move so the card snaps back to its original column.
      setOptimisticStatus(key, revertTo);
      if (status === 403 || status === 401) {
        setToast(`${key}: You don't have permission to make this transition.`);
        return;
      }
      if (status === 409) {
        setToast(`${key}: This transition isn't available from the current state. Move it via Jira.`);
        return;
      }
      // 502/other: Jira upstream failure or network.
      setToast(`${key}: Couldn't update Jira. The card has been reverted. Try again, or make the change in Jira.`);
      return;
    }
    invalidateTransitionCache(key);
    setOptimisticStatus(key, null); // confirmed; the refetch below reconciles
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
  }

  async function handleTransition(key: string, target: string) {
    setTransitionBusy(true);
    setToast(null);
    try {
      // `target` is a column KEY (or a prev/next marker). Resolve it to the
      // column's label (a real workflow status name) for the transition lookup.
      let targetKey: string;
      if (target === "__prev__" || target === "__next__") {
        const issue = issues.find((i) => i.jiraKey === key);
        if (!issue) return;
        const currentCol = findColumnForIssue(issue);
        const idx = columnKeys.indexOf(currentCol);
        const nextIdx = target === "__next__" ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= columnKeys.length) return;
        targetKey = columnKeys[nextIdx];
      } else {
        targetKey = target;
      }
      const targetCol = columns.find((c) => c.key === targetKey);
      const targetLabel = targetCol?.label ?? targetKey;

      const issue = issues.find((i) => i.jiraKey === key);
      const fromStatus = issue?.status ?? "";

      // No-op if the issue is already in the target column.
      if (issue && findColumnForIssue(issue) === targetKey) {
        setTransitionBusy(false);
        return;
      }

      const all = await fetchTransitions(key);
      const found = findTransition(all, targetLabel);

      if (!found) {
        // The workflow does not allow this move. Block it with a clear message
        // rather than silently failing — the user expected the card to move.
        setToast(
          `${key}: "${issue?.status || "current"}" cannot move to ${targetLabel}. The workflow doesn't allow this transition.`
        );
        return;
      }

      // Optimistic: move the card to the destination column now, before Jira
      // confirms. If the transition fails, doTransition reverts it.
      setOptimisticStatus(key, targetLabel);
      await doTransition(key, found.id, fromStatus);
    } catch (e) {
      setOptimisticStatus(key, null);
      setToast(`${key}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setTransitionBusy(false);
    }
  }

  /**
   * Card quick actions (the ⋯ menu). Field updates (assignee / priority) hit the
   * per-issue PATCH; "done" runs the same transition flow as a drag. Jira deep
   * link and key copy are local. All Jira writes are confirmed then the issues
   * cache is invalidated so the board reconciles.
   */
  async function handleQuickAction(key: string, action: QuickAction) {
    try {
      switch (action.kind) {
        case "openJira": {
          const base = jiraBaseUrl.replace(/\/$/, "");
          if (base) window.open(`${base}/browse/${key}`, "_blank", "noopener");
          else setToast("Jira base URL isn't configured.");
          return;
        }
        case "copyKey": {
          try {
            await navigator.clipboard.writeText(key);
            setToast(`Copied ${key}`);
          } catch {
            setToast("Couldn't copy to clipboard.");
          }
          return;
        }
        case "openFull": {
          router.push(`/issue/${key}`);
          return;
        }
        case "assignee": {
          await api(`/api/issues/${key}`, {
            method: "PATCH",
            body: { assignee: action.value },
          });
          await qc.invalidateQueries({ queryKey: issuesKeys.all });
          setToast(action.value ? `${key} → ${action.value}` : `${key} unassigned`);
          return;
        }
        case "priority": {
          await api(`/api/issues/${key}`, {
            method: "PATCH",
            body: { priority: action.value },
          });
          await qc.invalidateQueries({ queryKey: issuesKeys.all });
          setToast(`${key} priority → ${action.value}`);
          return;
        }
        case "done": {
          const issue = issues.find((i) => i.jiraKey === key);
          const fromStatus = issue?.status ?? null;
          // Find a transition into a done-category status.
          const all = await fetchTransitions(key);
          const doneCol = columns.find((c) => c.category === "done");
          const target = doneCol?.label ?? "Done";
          const found =
            all.find((tr) => {
              const t = toName(tr);
              const cat = statusCategoryMap[t] ?? statusCategoryMap[t.toLowerCase()];
              return cat === "done";
            }) ?? null;
          if (!found) {
            setToast(`${key}: No "done" transition is available from the current state.`);
            return;
          }
          setOptimisticStatus(key, target);
          await doTransition(key, found.id, fromStatus);
          return;
        }
      }
    } catch (e) {
      const err = e as ApiError;
      const msg = err.status ? `update failed (HTTP ${err.status})` : (err as unknown as Error).message;
      setToast(`${key}: ${msg.slice(0, 100)}`);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setAllowedCols(null);
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const key = String(active.id);
    const targetColumn = String(over.id);
    const source = issues.find((i) => i.jiraKey === key);
    if (!source) return;
    // skip if already in this column (exact or via category routing)
    const currentCol = findColumnForIssue(source);
    if (currentCol === targetColumn) return;
    handleTransition(key, targetColumn);
  }

  /**
   * A card may only be dropped into a column the workflow actually allows. The
   * collision-detection function receives the candidate columns (ranked) and
   * returns the first one the card can move to; if the nearest is off-limits we
   * fall back to the card's own column so it animates back instead of moving
   * illegally. Returning an empty array also rejects the drop (card returns).
   */
  function collisionDetection(args: Parameters<CollisionDetection>[0]): ReturnType<CollisionDetection> {
    // Rank candidates with the default (closestCorners) detector, then keep
    // only the first column the card may legally move to. If the nearest is
    // off-limits, return [] so the drop is rejected and the card animates back.
    const ranked = closestCorners(args);
    const activeKey = String(args.active.id).replace(/^card:/, "");
    const source = issues.find((i) => i.jiraKey === activeKey);
    if (!source) return [];
    const currentCol = findColumnForIssue(source);
    const all = transitionCache.current.get(activeKey) ?? [];
    const allowed = new Set(
      columns
        .filter((c) => c.key === currentCol || canDropTo(all, c.label, c.category, c.key))
        .map((c) => c.key)
    );
    const first = ranked.find((r) => allowed.has(String(r.id)));
    return first ? [first] : [];
  }

  // While dragging, tell every column whether the active card may drop into it
  // so the UI can highlight reachable (teal) vs unreachable (red) columns live.
  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const activeKey = activeId.replace(/^card:/, "");
    const source = issues.find((i) => i.jiraKey === activeKey);
    if (!source) {
      setAllowedCols(null);
      return;
    }
    const all = transitionCache.current.get(activeKey) ?? [];
    const currentCol = findColumnForIssue(source);
    setAllowedCols(
      new Set(
        columns
          .filter((c) => c.key === currentCol || canDropTo(all, c.label, c.category, c.key))
          .map((c) => c.key)
      )
    );
  }

  // A signature of the visible set + sort; when it changes, the bounded
  // "load more" counters reset so columns re-render from the top.
  const colResetSig = useMemo(
    () => `${selectedProject}|${sortMode}|${filterSig}|${issues.length}`,
    [selectedProject, sortMode, filterSig, issues.length]
  );
  // Reset the bounded counters when the visible set / sort / project changes.
  // Derived (not in an effect) so a sig change clears the counters on the next
  // render without a setState-in-effect.
  const colVisible = useMemo(
    () => (colVisibleState.sig === colResetSig ? colVisibleState.counts : {}),
    [colVisibleState, colResetSig]
  );

  const WIP_LIMIT = 8; // in-progress columns warn beyond this

  const boardColumnsRender = useMemo(() => {
    const seen = new Map<string, number>();
    return columns.map((c, i) => {
      const idxInCat = seen.get(c.category) ?? 0;
      seen.set(c.category, idxInCat + 1);
      const all = sortedByColumn.get(c.key) ?? [];
      const count = colVisible[c.key] ?? COL_BATCH;
      return {
        id: c.key,
        label: c.label,
        category: c.category,
        isDone: c.isDone,
        colIndex: i,
        columnCount: columns.length,
        dotColor: statusDot(c.category, idxInCat),
        textColor: statusText(c.category),
        items: all.slice(0, count),
        total: all.length,
        wipOver: c.category === "indeterminate" && all.length > WIP_LIMIT,
        collapsed: collapsedCols.has(c.key),
      };
    });
  }, [columns, sortedByColumn, colVisible, collapsedCols]);

  function growColumn(colId: string) {
    setColVisibleState((prev) => {
      const counts = prev.sig === colResetSig ? { ...prev.counts } : {};
      counts[colId] = (counts[colId] ?? COL_BATCH) + COL_BATCH;
      return { sig: colResetSig, counts };
    });
  }

  function toggleCollapse(colId: string) {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }

  // Keyboard navigation (#10): a flat, column-major order of the rendered cards
  // (skipping collapsed columns). Arrow keys move focus; Enter opens the quick
  // panel. Only active in the board view.
  const focusOrder = useMemo(
    () =>
      boardColumnsRender
        .filter((c) => !c.collapsed)
        .flatMap((c) => c.items.map((i) => i.jiraKey)),
    [boardColumnsRender]
  );

  useEffect(() => {
    if (effectiveView !== "board" || focusOrder.length === 0) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
      if (!keys.includes(e.key) && e.key !== "Enter" && e.key !== "Home" && e.key !== "End") return;

      const idx = focusKey ? focusOrder.indexOf(focusKey) : -1;
      let next = idx;
      if (e.key === "Enter") {
        if (idx === -1) return;
        const issue = issues.find((i) => i.jiraKey === focusOrder[idx]);
        if (issue) {
          e.preventDefault();
          setQuickPanel(issue);
        }
        return;
      }
      e.preventDefault();
      if (idx === -1) {
        next = e.key === "ArrowLeft" || e.key === "ArrowUp" ? focusOrder.length - 1 : 0;
      } else {
        next =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? Math.min(focusOrder.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = focusOrder.length - 1;
      }
      const key = focusOrder[next];
      setFocusKey(key);
      const node = cardRefs.current.get(key);
      if (node) {
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveView, focusOrder, focusKey, issues]);

  if (effectivePreferred.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ListFilter className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No projects selected</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Choose which Jira projects to show on your board to get started.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          <ListFilter className="h-4 w-4" /> Choose projects
        </Button>
      </div>
    );
  }

  const tabCls = (active: boolean) =>
    "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground");

  const dndDisabled = effectiveView === "list" || transitionBusy;

  return (
    <div className="relative flex h-full flex-col gap-3">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm font-medium shadow-lg ring-1 ring-black/5 dark:ring-white/5"
        >
          {toast}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {projectList.map((p) => (
            <button key={p.key} onClick={() => setProject(p.key)} className={tabCls(selectedProject === p.key)}>
              {p.key}
              <span
                className={
                  "rounded-full px-1.5 text-xs " +
                  (selectedProject === p.key ? "bg-primary-foreground/20" : "bg-background/60")
                }
              >
                {p.openCount}
              </span>
            </button>
          ))}

          <div className="relative">
            <button
              onClick={() => (showPicker ? closePicker() : openPicker())}
              className={
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (effectivePreferred.length > 0
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              <ListFilter className="h-4 w-4" />
              {effectivePreferred.length > 0 ? `${effectivePreferred.length} selected` : "Choose projects"}
            </button>
            {showPicker && (
              <Card className="absolute left-0 top-full z-20 mt-1 w-56 p-3 shadow-lg">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Show these projects on your board
                </p>
                <div className="flex max-h-64 flex-col gap-1 overflow-auto">
                  {availableKeys.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox checked={pickerSet.has(key)} onCheckedChange={() => togglePicker(key)} />
                      <span className="flex-1">{key}</span>
                      <span className="text-xs text-muted-foreground">{countMap.get(key) ?? 0}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <button
                    onClick={() => setPickerSelection(availableKeys)}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    Show all
                  </button>
                  <Button size="sm" variant="ghost" onClick={commitPicker}>
                    Done
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncJira}
            disabled={syncQueued}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", (syncQueued || isFetching) && "animate-spin motion-reduce:animate-none")} />
            {syncQueued ? "Đã xếp hàng" : "Đồng bộ Jira"}
          </Button>
          <div className="flex rounded-md border p-0.5">
          {(["board", "list"] as ViewMode[]).map((m) => {
            const isNarrow = width === "narrow";
            const disabled = isNarrow && m === "board";
            const active = effectiveView === m;
            return (
              <button
                key={m}
                onClick={() => !disabled && setView(m)}
                disabled={disabled}
                title={disabled ? "Không khả dụng ở độ rộng màn hình này" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : disabled
                      ? "cursor-not-allowed text-muted-foreground/40"
                      : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "board" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                <span className="hidden sm:inline">{m === "board" ? "Bảng" : "Danh sách"}</span>
              </button>
            );
          })}
          </div>

          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-8 w-auto gap-1.5 text-sm" title="Sắp xếp thẻ trong từng cột">
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Độ ưu tiên</SelectItem>
              <SelectItem value="updated">Mới cập nhật</SelectItem>
              <SelectItem value="age">Cũ nhất trước</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaletteOpen(true)}
            className="gap-1.5"
            title="Chuyển nhanh đến task (Ctrl/Cmd + K)"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Tìm nhanh</span>
            <kbd className="ml-1 hidden rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground md:inline">
              ⌘K
            </kbd>
          </Button>
        </div>
      </div>

      {data?.sync.stale && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Dữ liệu Jira chưa được đồng bộ mới</p>
            <p className="text-xs opacity-90">
              Đồng bộ thành công lần cuối: {data.sync.lastSuccessAt ? timeAgo(data.sync.lastSuccessAt) : "chưa từng"}.
              Hãy xếp hàng đồng bộ hoặc kiểm tra worker trước khi ra quyết định phát hành.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Tìm kiếm trong ${selectedProject}…`}
            className="pl-8"
          />
        </div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Người phụ trách" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="me">Bạn{myName ? ` (${myName})` : ""}</SelectItem>
            <SelectItem value="ALL">Tất cả người phụ trách</SelectItem>
            {assignees
              .filter((a) => a !== myName)
              .map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={label || ""} onValueChange={(v) => setLabel(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Nhãn" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả nhãn</SelectItem>
            {labelOptions.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority || ""} onValueChange={(v) => setPriority(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Độ ưu tiên" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả độ ưu tiên</SelectItem>
            <SelectItem value="Low">Low (Thấp)</SelectItem>
            <SelectItem value="Medium">Medium (Trung bình)</SelectItem>
            <SelectItem value="High">High (Cao)</SelectItem>
            <SelectItem value="Highest">Highest (Rất cao)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryTile
          label="Mở"
          value={summary.open}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="bg-sky-500/12 text-sky-600 dark:text-sky-400"
        />
        <SummaryTile
          label="Đang làm"
          value={summary.inProgress}
          icon={<ListFilter className="h-4 w-4" />}
          tone="bg-primary/12 text-primary"
        />
        <SummaryTile
          label="Tồn đọng (7d+)"
          value={summary.stale}
          icon={<Clock className="h-4 w-4" />}
          tone="bg-amber-500/12 text-amber-600 dark:text-amber-400"
        />
        <SummaryTile
          label="Hoàn thành"
          value={summary.done}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {activeProject && (
        <div className="text-sm text-muted-foreground">
          Dự án <span className="font-semibold text-foreground">{activeProject.key}</span> ·{" "}
          {issues.length} task
        </div>
      )}

      {isLoading ? (
        <BoardSkeleton columnCount={columns.length || 5} />
      ) : issues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Không có task nào để hiển thị</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Hãy thử điều chỉnh bộ lọc, hoặc chạy đồng bộ Jira để làm mới bảng.
          </p>
        </div>
      ) : effectiveView === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={(e) => {
            const issue = issues.find((i) => i.jiraKey === String(e.active.id));
            setActiveDrag(issue ?? null);
            setAllowedCols(null);
          }}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setAllowedCols(null);
            setActiveDrag(null);
          }}
        >
          <div
            ref={boardScrollRef}
            className="flex flex-1 gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
          >
            {boardColumnsRender.map((col) => (
              <BoardColumn
                key={col.id}
                id={col.id}
                label={col.label}
                category={col.category}
                isDone={col.isDone}
                items={col.items}
                colIndex={col.colIndex}
                columnCount={col.columnCount}
                onTransition={handleTransition}
                busy={transitionBusy}
                dndDisabled={dndDisabled}
                onOverChange={setDragOverCol}
                dotColor={col.dotColor}
                dragBlocked={allowedCols != null && !allowedCols.has(col.id)}
                optimistic={optimistic}
                wipOver={col.wipOver}
                collapsed={col.collapsed}
                total={col.total}
                onGrow={growColumn}
                onToggleCollapse={toggleCollapse}
                onOpen={(issue) => setQuickPanel(issue)}
                onQuickAction={handleQuickAction}
                assignees={assignees}
                registerRef={(key, el) => cardRefs.current.set(key, el)}
                focusKey={focusKey}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
            {activeDrag ? (
              <div className="rotate-2 scale-[1.03]">
                <CardContent issue={activeDrag} done={false} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-x-auto pb-2">
          {boardColumnsRender.map((col) => {
            const items = col.items;
            if (items.length === 0) return null;
            const done = col.category === "done";
            const sorted = [...items].sort((a, b) => {
              const ra = PRIORITY_RANK[a.priority] ?? 9;
              const rb = PRIORITY_RANK[b.priority] ?? 9;
              if (ra !== rb) return ra - rb;
              return daysSince(b.updatedAt) - daysSince(a.updatedAt);
            });
            return (
              <div key={col.id}>
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className={cn("h-2 w-2 rounded-full", col.dotColor)} />
                  <span className={cn("text-sm font-semibold", col.textColor)}>{col.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {sorted.map((issue) => (
                    <DraggableCard
                      key={issue.jiraKey}
                      issue={issue}
                      done={done}
                      colIndex={col.colIndex}
                      columnCount={col.columnCount}
                        onTransition={handleTransition}
                        busy={transitionBusy}
                        dndDisabled={dndDisabled}
                        showNavButtons={false}
                        onOpen={(issue) => setQuickPanel(issue)}
                        onQuickAction={handleQuickAction}
                        assignees={assignees}
                      />
                    ))}
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pb-1">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="gap-1.5"
          >
            {loadingMore ? "Loading…" : `Load more (${loadedTotal - issues.length} remaining)`}
          </Button>
        </div>
      )}

      {paletteOpen && (
        <div
          className="absolute inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Jump to issue"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && paletteResults[0]) {
                    e.preventDefault();
                    setPaletteOpen(false);
                    router.push(`/issue/${paletteResults[0].jiraKey}`);
                  }
                }}
                placeholder="Nhập mã task hoặc tóm tắt…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Esc
              </kbd>
            </div>
            <div className="max-h-72 overflow-auto p-1.5">
              {paletteResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Không tìm thấy task nào phù hợp trên bảng này.
                </p>
              ) : (
                paletteResults.map((issue) => (
                  <button
                    key={issue.jiraKey}
                    onClick={() => {
                      setPaletteOpen(false);
                      router.push(`/issue/${issue.jiraKey}`);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent"
                  >
                    <span className="font-mono text-xs font-semibold text-primary">{issue.jiraKey}</span>
                    <span className="flex-1 truncate text-sm">{issue.summary || "(no summary)"}</span>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      {issue.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {quickPanel && (
        <QuickPanel
          issue={quickPanel}
          jiraBaseUrl={jiraBaseUrl}
          assignees={assignees}
          onClose={() => setQuickPanel(null)}
        />
      )}
    </div>
  );
}

/**
 * Quick panel: a right-side slide-over with the issue's detail. It renders
 * instantly from the card's cached data, then silently refreshes from the
 * server for freshness (staleTime 15s). Carries the same quick actions as the
 * card menu plus watch, add-comment, and move-to. "Open full detail" navigates
 * to the full page.
 */
type QuickPanelDetail = {
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
};

function QuickPanel({
  issue,
  jiraBaseUrl,
  assignees,
  onClose,
}: {
  issue: IssueItem;
  jiraBaseUrl: string;
  assignees: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [watched, setWatched] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];

  const { data: detail } = useQuery({
    queryKey: issuesKeys.detail(issue.jiraKey),
    queryFn: () => api<{ issue: QuickPanelDetail }>(`/api/issues/${issue.jiraKey}`),
    staleTime: 15_000,
    retry: 1,
  });

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ transitions: { id: string; to?: { name?: string } | string }[] }>(
        `/api/issues/${issue.jiraKey}/transitions`
      ),
    retry: 1,
  });

  const d = detail?.issue;
  const summary = d?.summary || issue.summary || "(no summary)";
  const status = d?.status ?? issue.status;
  const statusCat = issue.statusCategory;
  const priority = d?.priority ?? issue.priority;
  const assigneeJira = d?.assigneeJira ?? issue.assigneeJira;
  const points = d?.points ?? issue.points;
  const type = d?.type ?? issue.type ?? "—";
  const labels = d?.labels ?? issue.labels;
  const updatedAt = d?.updatedAt ?? issue.updatedAt;
  const createdAt = d?.createdAt ?? issue.createdAt;
  const lastSyncedAt = d?.lastSyncedAt ?? issue.lastSyncedAt;
  const aiScore = d?.aiScore ?? issue.aiScore;
  const aiDecision = d?.aiDecision ?? issue.aiDecision;
  const description = d?.description ?? issue.description;
  const stale = d?.staleSnapshots?.[0] ?? null;
  const releases = d?.releaseTasks ?? [];

  function toName(t: { to?: { name?: string } | string }): string {
    return typeof t.to === "string" ? t.to : t.to?.name ?? "";
  }

  // Auto-focus the panel on open; trap Tab inside; Escape closes (the board's
  // global Esc handler also closes, but trapping keeps focus sane).
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    const node = panelRef.current;
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
    qc.invalidateQueries({ queryKey: issuesKeys.detail(issue.jiraKey) });
  }

  async function doAction(action: QuickAction) {
    const key = issue.jiraKey;
    try {
      if (action.kind === "openJira") {
        const base = jiraBaseUrl.replace(/\/$/, "");
        if (base) window.open(`${base}/browse/${key}`, "_blank", "noopener");
        return;
      }
      if (action.kind === "openFull") {
        router.push(`/issue/${key}`);
        return;
      }
      if (action.kind === "copyKey") {
        await navigator.clipboard.writeText(key);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
        return;
      }
      if (action.kind === "assignee") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { assignee: action.value } });
      } else if (action.kind === "priority") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { priority: action.value } });
      } else {
        const done = (transitions?.transitions ?? []).find(
          (t) => toName(t) && statusCatOf(t, issue)
        );
        if (done) await api(`/api/issues/${key}/transition`, { method: "POST", body: { transitionId: done.id } });
      }
      await invalidate();
    } catch {
      // Swallow; the board refetches on its own poll.
    }
  }

  function statusCatOf(t: { to?: { name?: string } | string }, i: IssueItem) {
    // Approximate "done" by the to-name; the board already computes exact
    // categories, but a name match against a done-ish label is good enough here.
    const n = toName(t).toLowerCase();
    return /done|resolved|closed|complete/.test(n) || i.statusCategory === "done";
  }

  async function toggleWatch() {
    try {
      await api(`/api/issues/${issue.jiraKey}/watch`, { method: "POST", body: {} });
      setWatched(true);
    } catch {
      // Ignore.
    }
  }

  async function addComment() {
    const text = commentDraft.trim();
    if (!text || commenting) return;
    setCommenting(true);
    try {
      await api(`/api/issues/${issue.jiraKey}/comments`, { method: "POST", body: { body: text } });
      setCommentDraft("");
      await invalidate();
    } catch {
      // Ignore.
    } finally {
      setCommenting(false);
    }
  }

  const dotClass = CATEGORY_DOT_MAP[statusCat] ?? "bg-slate-400";
  const commentCount = d?.comments?.length ?? 0;

  return (
    <div
      className="absolute inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${issue.jiraKey} quick panel`}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l bg-card shadow-2xl outline-none motion-safe:animate-[panelIn_180ms_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
          <span className="font-mono text-sm font-semibold text-primary">{issue.jiraKey}</span>
          <Badge variant="secondary" className="text-[11px]">{status}</Badge>
          {priority && (
            <Badge variant="outline" className="text-[11px]">{priority}</Badge>
          )}
          {points != null && (
            <Badge variant="outline" className="text-[11px]">{points}pt</Badge>
          )}
          {aiScore && (
            <Badge
              variant={aiDecision ? (aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
              className="h-4 gap-1 px-1.5 text-[10px]"
              title={aiDecision ? `AI ${aiDecision.decision}` : "AI estimate (pending)"}
            >
              <Bot className="h-2.5 w-2.5" />
              {aiScore.points}pt
            </Badge>
          )}
          {stale && (
            <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]">
              <Clock className="h-2.5 w-2.5" /> {stale.stateAgeDays}d
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={() => { navigator.clipboard.writeText(issue.jiraKey).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Copy key"
              title="Copy key"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          <h2 className="text-base font-semibold leading-snug">{summary}</h2>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Status">{status}</Field>
            <Field label="Priority">{priority || "—"}</Field>
            <Field label="Assignee">
              {assigneeJira ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      avatarClass(assigneeJira)
                    )}
                  >
                    {initials(assigneeJira)}
                  </span>
                  <span className="truncate">{assigneeJira}</span>
                </span>
              ) : (
                "Unassigned"
              )}
            </Field>
            <Field label="Points">{points != null ? `${points} pt` : "—"}</Field>
            <Field label="Type">{type}</Field>
            <Field label="Updated">{timeAgo(updatedAt)}</Field>
            <Field label="Created">{formatDateTime(createdAt)}</Field>
            <Field label="Last synced">{timeAgo(lastSyncedAt)}</Field>
          </div>

          {releases.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {releases.map((rt, i) => (
                <Badge key={i} variant="info" className="text-[11px]">
                  {rt.release.version} · {rt.release.status}
                </Badge>
              ))}
            </div>
          )}

          {labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <Badge key={l} variant="outline" className="text-[11px]">{l}</Badge>
              ))}
            </div>
          )}

          <Section title="Description">
            {description ? (
              <div
                className="wiki-content text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: wikiToHtml(description) }}
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">No description.</p>
            )}
          </Section>

          <Section title={`Comments (${commentCount})`}>
            <div className="flex gap-2">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void addComment();
                }}
                placeholder="Thêm bình luận lên Jira…"
                rows={2}
                className="min-h-[3rem] flex-1 resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={commenting || !commentDraft.trim()}
                onClick={() => void addComment()}
                className="h-8 shrink-0 gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> {commenting ? "…" : "Gửi"}
              </Button>
            </div>
            {(d?.comments ?? []).length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {(d?.comments ?? [])
                  .slice(-3)
                  .map((c) => (
                    <div key={c.id} className="rounded-md border bg-muted/30 p-2.5">
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="font-medium">{c.author}</span>
                        <span className="text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <div
                        className="wiki-content text-sm"
                        dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
                      />
                    </div>
                  ))}
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (watched ? setWatched(false) : void toggleWatch())}
            className="gap-1.5"
            title={watched ? "Stop watching" : "Watch"}
          >
            {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {watched ? "Watching" : "Watch"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const base = jiraBaseUrl.replace(/\/$/, "");
              if (base) window.open(`${base}/browse/${issue.jiraKey}`, "_blank", "noopener");
            }}
            className="gap-1.5"
            title="Open in Jira"
          >
            <ExternalLink className="h-4 w-4" /> Jira
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); void doAction({ kind: "assignee", value: null }); }}
                className="gap-2"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Unassigned
              </DropdownMenuItem>
              {assignees.slice(0, 12).map((a) => (
                <DropdownMenuItem
                  key={a}
                  onSelect={(e) => { e.preventDefault(); void doAction({ kind: "assignee", value: a }); }}
                  className="gap-2"
                >
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span className="truncate">{a}</span>
                  {a === assigneeJira && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              {priorities.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onSelect={(e) => { e.preventDefault(); void doAction({ kind: "priority", value: p }); }}
                  className="gap-2"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden /> {p}
                  {p === priority && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
              {transitions && transitions.transitions.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Move to…</DropdownMenuLabel>
                  {transitions.transitions.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        void (async () => {
                          try {
                            await api(`/api/issues/${issue.jiraKey}/transition`, {
                              method: "POST",
                              body: { transitionId: t.id },
                            });
                            await invalidate();
                          } catch {
                            // ignore
                          }
                        })();
                      }}
                      className="gap-2"
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> {toName(t)}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => router.push(`/issue/${issue.jiraKey}`)}
            title="Open full detail"
          >
            <CornerDownLeft className="h-4 w-4" /> Full detail
          </Button>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_DOT_MAP: Record<string, string> = {
  new: "bg-slate-400",
  indeterminate: "bg-amber-400",
  done: "bg-emerald-500",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}
