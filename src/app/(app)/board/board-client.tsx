"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError } from "@/lib/api-client";
import { useIssues, fetchIssuesPage, type IssueItem } from "@/hooks/use-issues";
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
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type BoardWidth } from "@/lib/status-groups";
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
} from "lucide-react";

type Project = { key: string; openCount: number };
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

function priorityAccent(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "blocker") return "border-l-rose-500";
  if (p === "highest" || p === "high") return "border-l-amber-500";
  return "border-l-transparent";
}

/** Dot + header color per Jira status category key (stable across instances). */
const CATEGORY_STYLE: Record<string, { dot: string; text: string }> = {
  new: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  indeterminate: { dot: "bg-primary", text: "text-primary" },
  done: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};
const FALLBACK_CATEGORY_STYLE = CATEGORY_STYLE.new;

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

function CardContent({ issue, done, dragging }: { issue: IssueItem; done: boolean; dragging?: boolean }) {
  const stale = daysSince(issue.updatedAt) >= 7 && !done;
  return (
    <Card
      className={cn(
        "border-l-2 p-2.5 transition-colors",
        priorityAccent(issue.priority || ""),
        dragging ? "rotate-2 scale-105 shadow-lg" : "hover:bg-accent/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{issue.jiraKey}</span>
        {issue.points != null && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {issue.points}pt
          </Badge>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{issue.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {issue.aiScore && (
          <Badge
            variant={issue.aiDecision ? (issue.aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
            className="gap-1"
            title={issue.aiDecision ? `AI estimate ${issue.aiDecision.decision}` : "AI estimate (pending review)"}
          >
            <Bot className="h-3 w-3" />
            AI {issue.aiScore.points}pt
            {issue.aiScore.confidence != null ? ` (${(issue.aiScore.confidence * 100).toFixed(0)}%)` : ""}
          </Badge>
        )}
        {stale && (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            {daysSince(issue.updatedAt)}d
          </Badge>
        )}
        {issue.assigneeJira && (
          <Badge variant="outline" className="max-w-[7rem] truncate">
            {issue.assigneeJira}
          </Badge>
        )}
        {issue.priority && (
          <Badge variant="outline" className="max-w-[6rem] truncate">
            {issue.priority}
          </Badge>
        )}
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        updated {timeAgo(issue.updatedAt)}
      </div>
    </Card>
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
}: {
  issue: IssueItem;
  done: boolean;
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
  showNavButtons: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.jiraKey,
    disabled: dndDisabled,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), transition: "transform 200ms ease" }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("relative", isDragging && "z-10 opacity-50")}
    >
      <Link href={`/issue/${issue.jiraKey}`} className="block">
        <CardContent issue={issue} done={done} />
      </Link>

      {showNavButtons && !dndDisabled && (colIndex > 0 || colIndex < columnCount - 1) && (
        <div
          className="absolute right-1.5 top-1.5 flex items-center gap-0.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {colIndex > 0 && (
            <button
              onClick={() => onTransition(issue.jiraKey, "__prev__")}
              disabled={busy}
              title="Move to previous column"
              aria-label="Move to previous column"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {colIndex < columnCount - 1 && (
            <button
              onClick={() => onTransition(issue.jiraKey, "__next__")}
              disabled={busy}
              title="Move to next column"
              aria-label="Move to next column"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  id,
  label,
  category,
  isDone,
  items,
  colIndex,
  columnCount,
  onTransition,
  busy,
  dndDisabled,
}: {
  id: string;
  label: string;
  category: string;
  isDone: boolean;
  items: IssueItem[];
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const style = CATEGORY_STYLE[category] ?? FALLBACK_CATEGORY_STYLE;

  return (
    <div className="flex min-w-0 flex-1 basis-64 flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className={cn("flex min-w-0 items-center gap-1.5 text-sm font-semibold", style.text)}>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[4rem] flex-col gap-2 overflow-y-auto rounded-md transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/20"
        )}
      >
        {items.map((issue) => (
          <DraggableCard
            key={issue.jiraKey}
            issue={issue}
            done={isDone}
            colIndex={colIndex}
            columnCount={columnCount}
            onTransition={onTransition}
            busy={busy}
            dndDisabled={dndDisabled}
            showNavButtons
          />
        ))}
        {items.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/70">
            {isOver ? "Drop here" : "No tasks"}
          </p>
        )}
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
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-md bg-background/70", tone)}>
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
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [activeDrag, setActiveDrag] = useState<IssueItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{
    key: string;
    target: string;
    options: string[];
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: Project[] }>("/api/projects"),
    refetchInterval: 30000,
    retry: 0,
  });
  const allProjects = useMemo(() => projects?.items ?? [], [projects?.items]);

  const { data: meStatus } = useQuery({
    queryKey: ["me", "status"],
    queryFn: () => api<{ jiraName: string | null }>("/api/me/status"),
    retry: 0,
  });
  const myName = meStatus?.jiraName ?? null;

  const { data: prefs } = useQuery({
    queryKey: ["me", "prefs"],
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
      qc.invalidateQueries({ queryKey: ["me", "prefs"] }),
      qc.invalidateQueries({ queryKey: ["projects"] }),
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
  const selectedProject = effectivePreferred.includes(project) ? project : (effectivePreferred[0] ?? "");

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
        void qc.invalidateQueries({ queryKey: ["issues"] });
        void qc.invalidateQueries({ queryKey: ["projects"] });
        setSyncQueued(false);
      }, 1500);
    } catch (error) {
      setToast(`Could not queue Jira sync: ${(error as Error).message.slice(0, 100)}`);
      setSyncQueued(false);
    }
  }

  const { data: optData } = useQuery({
    queryKey: ["issues", "filters", selectedProject],
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

  // Dynamic columns from the project's real Jira workflow (grouped by status
  // category). Falls back to the 3 default category columns if the endpoint is
  // empty (Jira not configured / error). Column identity = category key, so an
  // issue routes by its category, not by a fragile status-name match.
  const { data: statusesData } = useQuery({
    queryKey: ["board", "statuses", selectedProject],
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

  // Map an issue to the column that carries its status name.
  const columnKeyByStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) m.set(c.label, c.key);
    return m;
  }, [columns]);

  const byColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const c of columns) m.set(c.key, []);
    for (const issue of issues) {
      const col = columnKeyForIssue(issue, columnKeyByStatus, statusCategoryMap, columns);
      const bucket = m.get(col);
      if (bucket) bucket.push(issue);
    }
    return m;
  }, [issues, columns, columnKeyByStatus, statusCategoryMap]);

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

  function findColumnForIssue(issue: IssueItem): string {
    return columnKeyForIssue(issue, columnKeyByStatus, statusCategoryMap, columns);
  }

  const transitionCache = useRef(new Map<string, Transition[]>());

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

  async function doTransition(key: string, transitionId: string) {
    try {
      await api(`/api/issues/${key}/transition`, {
        method: "POST",
        body: { transitionId },
      });
    } catch (e) {
      const status = (e as ApiError)?.status ?? null;
      if (status === 403 || status === 401) {
        setToast(`${key}: You don't have permission to make this transition.`);
        return;
      }
      if (status === 409) {
        setToast(`${key}: This transition isn't available from the current state. Move it via Jira.`);
        return;
      }
      // 502/other: Jira upstream failure or network.
      setToast(`${key}: Couldn't update Jira. Try again, or make the change in Jira.`);
      return;
    }
    invalidateTransitionCache(key);
    await qc.invalidateQueries({ queryKey: ["issues"] });
  }

  async function handleTransition(key: string, target: string) {
    setTransitionBusy(true);
    setToast(null);
    setPendingChoice(null);
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
      const targetLabel = columns.find((c) => c.key === targetKey)?.label ?? targetKey;

      // No-op if the issue is already in the target column.
      const issue = issues.find((i) => i.jiraKey === key);
      if (issue && findColumnForIssue(issue) === targetKey) {
        setTransitionBusy(false);
        return;
      }

      const all = await fetchTransitions(key);
      const found = findTransition(all, targetLabel);

      if (!found) {
        const available = [...new Set(all.map(toName).filter(Boolean))];
        if (available.length > 0) {
          setPendingChoice({ key, target: targetLabel, options: available });
        } else {
          setToast(`${key}: no transitions available from the current state.`);
        }
        return;
      }

      await doTransition(key, found.id);
    } catch (e) {
      setToast(`${key}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setTransitionBusy(false);
    }
  }

  async function onPickTransition(status: string) {
    if (!pendingChoice) return;
    const { key } = pendingChoice;
    setPendingChoice(null);
    setTransitionBusy(true);
    try {
      const all = await fetchTransitions(key);
      const found = findTransition(all, status) ?? all.find((tr) => toName(tr).toLowerCase() === status.toLowerCase());
      if (!found) {
        setToast(`${key}: no transition found for "${status}". Move it via Jira.`);
        return;
      }
      await doTransition(key, found.id);
    } catch (e) {
      setToast(`${key}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setTransitionBusy(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
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

  const boardColumnsRender = useMemo(
    () =>
      columns.map((c, i) => ({
        id: c.key,
        label: c.label,
        category: c.category,
        isDone: c.isDone,
        colIndex: i,
        columnCount: columns.length,
        items: byColumn.get(c.key) ?? [],
      })),
    [columns, byColumn]
  );

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
          className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-popover px-4 py-2 text-sm shadow-md"
        >
          {toast}
        </div>
      )}
      <Dialog
        open={pendingChoice !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChoice(null);
        }}
      >
        <DialogContent className="w-full max-w-sm gap-3">
          <DialogHeader>
            <DialogTitle>
              {pendingChoice?.key}: no direct transition to {pendingChoice?.target}
            </DialogTitle>
            <DialogDescription>Choose a status to move to:</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {pendingChoice?.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onPickTransition(opt)}
                disabled={transitionBusy}
                className="rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
            {syncQueued ? "Queued" : "Sync Jira"}
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
                title={disabled ? "Not available at this screen width" : undefined}
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
                <span className="hidden sm:inline">{m === "board" ? "Board" : "List"}</span>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {data?.sync.stale && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Jira data is not fresh</p>
            <p className="text-xs opacity-90">
              Last successful sync: {data.sync.lastSuccessAt ? timeAgo(data.sync.lastSuccessAt) : "never"}.
              Queue a sync or check the worker before making release decisions.
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
            placeholder={`Search in ${selectedProject}…`}
            className="pl-8"
          />
        </div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Assignee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="me">You{myName ? ` (${myName})` : ""}</SelectItem>
            <SelectItem value="ALL">All assignees</SelectItem>
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
          <SelectTrigger className="w-40"><SelectValue placeholder="Label" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All labels</SelectItem>
            {labelOptions.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority || ""} onValueChange={(v) => setPriority(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Highest">Highest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryTile
          label="Open"
          value={summary.open}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="text-sky-600 dark:text-sky-400"
        />
        <SummaryTile
          label="In Progress"
          value={summary.inProgress}
          icon={<ListFilter className="h-4 w-4" />}
          tone="text-primary"
        />
        <SummaryTile
          label="Stale (7d+)"
          value={summary.stale}
          icon={<Clock className="h-4 w-4" />}
          tone="text-amber-600 dark:text-amber-400"
        />
        <SummaryTile
          label="Done"
          value={summary.done}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {activeProject && (
        <div className="text-sm text-muted-foreground">
          Project <span className="font-semibold text-foreground">{activeProject.key}</span> ·{" "}
          {issues.length} task(s)
        </div>
      )}

      {isLoading ? (
        <BoardSkeleton columnCount={columns.length || 5} />
      ) : issues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No tasks to show</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Try adjusting your filters, or run a Jira poll to refresh the board.
          </p>
        </div>
      ) : effectiveView === "board" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => {
            const issue = issues.find((i) => i.jiraKey === String(e.active.id));
            setActiveDrag(issue ?? null);
          }}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
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
              />
            ))}
          </div>
          <DragOverlay>
            {activeDrag ? <CardContent issue={activeDrag} done={false} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-x-auto pb-2">
          {columns.map((c, i) => {
            const items = byColumn.get(c.key) ?? [];
            if (items.length === 0) return null;
            const style = CATEGORY_STYLE[c.category] ?? FALLBACK_CATEGORY_STYLE;
            const done = c.category === "done";
            const sorted = [...items].sort((a, b) => {
              const ra = PRIORITY_RANK[a.priority] ?? 9;
              const rb = PRIORITY_RANK[b.priority] ?? 9;
              if (ra !== rb) return ra - rb;
              return daysSince(b.updatedAt) - daysSince(a.updatedAt);
            });
            return (
              <div key={c.key}>
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                  <span className={cn("text-sm font-semibold", style.text)}>{c.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {sorted.map((issue) => (
                    <DraggableCard
                      key={issue.jiraKey}
                      issue={issue}
                      done={done}
                      colIndex={i}
                      columnCount={columns.length}
                      onTransition={handleTransition}
                      busy={transitionBusy}
                      dndDisabled={dndDisabled}
                      showNavButtons={false}
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
    </div>
  );
}
