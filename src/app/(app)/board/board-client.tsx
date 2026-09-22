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
import { api } from "@/lib/api-client";
import { useIssues, type IssueItem } from "@/hooks/use-issues";
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
import { STATUS_GROUPS, STATUS_GROUP_STYLE, statusGroup, type BoardWidth } from "@/lib/status-groups";
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

function groupDone(group: string): boolean {
  return group === "Done";
}
function groupInProgress(group: string): boolean {
  return group === "In Progress";
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
  group,
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
  group: string;
  isDone: boolean;
  items: IssueItem[];
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const style = STATUS_GROUP_STYLE[group as keyof typeof STATUS_GROUP_STYLE] ?? STATUS_GROUP_STYLE["To Do"];

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
  const issuesQuery: Partial<import("@/hooks/use-issues").BoardFilters> = selectedProject
    ? { project: selectedProject }
    : {};
  const { data, isLoading, isFetching } = useIssues(
    {
      ...issuesQuery,
      q: q || undefined,
      label: label || undefined,
      priority: priority || undefined,
      assignee,
      includeDone: true,
      limit: 1000,
    },
    { enabled }
  );

  const issues = useMemo(() => data?.items ?? [], [data?.items]);
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

  const columns = useMemo(
    () => STATUS_GROUPS.map((g) => ({ name: g, group: g, isDone: g === "Done" })),
    []
  );

  const byColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const c of columns) m.set(c.name, []);
    for (const issue of issues) {
      const col = statusGroup(issue.status || "");
      m.get(col)!.push(issue);
    }
    return m;
  }, [issues, columns]);

  const summary = useMemo(() => {
    let inProgress = 0;
    let done = 0;
    let stale = 0;
    for (const c of columns) {
      const items = byColumn.get(c.name) ?? [];
      if (groupInProgress(c.group)) inProgress += items.length;
      if (groupDone(c.group)) done += items.length;
      if (!groupDone(c.group)) stale += items.filter((i) => daysSince(i.updatedAt) >= 7).length;
    }
    return { inProgress, stale, done, open: issues.length - done };
  }, [columns, byColumn, issues]);

  const activeProject = projectList.find((p) => p.key === selectedProject) ?? null;

  const columnNames = useMemo(() => columns.map((c) => c.name as string), [columns]);

  function findColumnForIssue(issue: IssueItem): string | undefined {
    return statusGroup(issue.status || "") as string;
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
   * Match a transition's target status against a desired status name.
   * 1. Exact (case-insensitive) match — always wins.
   * 2. Fallback: only when the desired name is a known column/category word,
   *    match a transition whose target *contains* it as a whole word. This is
   *    intentionally narrow to avoid e.g. "To Do" matching "Opened by ...".
   */
  const CATEGORY_WORDS: Record<string, RegExp> = {
    done: /\b(done|closed|resolved|complete|released|deploy(ed|ing)?|finish(?:ed)?)\b/i,
    "in review": /\b(review|qa|test|verification|testing)\b/i,
    "in progress": /\b(in progress|progress|doing|working|active)\b/i,
    "to do": /\b(todo|to do|new|open|pending|queued|ready)\b/i,
    backlog: /\b(backlog|parked|someday|later)\b/i,
  };

  function findTransition(
    all: Transition[],
    targetStatus: string
  ): Transition | null {
    const tl = targetStatus.toLowerCase().trim();
    const exact = all.find((tr) => toName(tr).toLowerCase().trim() === tl);
    if (exact) return exact;
    for (const [cat, re] of Object.entries(CATEGORY_WORDS)) {
      if (tl === cat.toLowerCase() || tl.includes(cat.toLowerCase())) {
        const m = all.find((tr) => re.test(toName(tr)));
        if (m) return m;
      }
    }
    return null;
  }

  async function doTransition(key: string, transitionId: string) {
    await api(`/api/issues/${key}/transition`, {
      method: "POST",
      body: { transitionId },
    });
    invalidateTransitionCache(key);
    await qc.invalidateQueries({ queryKey: ["issues"] });
  }

  async function handleTransition(key: string, target: string) {
    setTransitionBusy(true);
    setToast(null);
    setPendingChoice(null);
    try {
      let targetStatus: string;
      if (target === "__prev__" || target === "__next__") {
        const issue = issues.find((i) => i.jiraKey === key);
        if (!issue) return;
        const currentCol = findColumnForIssue(issue);
        if (!currentCol) return;
        const idx = columnNames.indexOf(currentCol);
        const nextIdx = target === "__next__" ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= columnNames.length) return;
        targetStatus = columnNames[nextIdx];
      } else {
        targetStatus = target;
      }

      const all = await fetchTransitions(key);
      const found = findTransition(all, targetStatus);

      if (!found) {
        const available = [...new Set(all.map(toName).filter(Boolean))];
        if (available.length > 0) {
          setPendingChoice({ key, target: targetStatus, options: available });
        } else {
          setToast(`${key}: no transitions available from current state`);
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
      const found = findTransition(all, status);
      if (!found) {
        setToast(`${key}: no transition found for "${status}"`);
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
        id: c.name,
        label: c.name,
        group: c.group,
        isDone: c.isDone,
        colIndex: i,
        columnCount: columns.length,
        items: byColumn.get(c.name) ?? [],
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
                group={col.group}
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
            const items = byColumn.get(c.name) ?? [];
            if (items.length === 0) return null;
            const style = STATUS_GROUP_STYLE[c.group as keyof typeof STATUS_GROUP_STYLE] ?? STATUS_GROUP_STYLE["To Do"];
            const done = groupDone(c.group);
            const sorted = [...items].sort((a, b) => {
              const ra = PRIORITY_RANK[a.priority] ?? 9;
              const rb = PRIORITY_RANK[b.priority] ?? 9;
              if (ra !== rb) return ra - rb;
              return daysSince(b.updatedAt) - daysSince(a.updatedAt);
            });
            return (
              <div key={c.name}>
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                  <span className={cn("text-sm font-semibold", style.text)}>{c.name}</span>
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
    </div>
  );
}
