"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { api, ApiError } from "@/lib/api-client";
import {
  useIssues,
  fetchIssuesPage,
  type IssueItem,
  type IssueSuccessResponse,
} from "@/hooks/use-issues";
import { issuesKeys, boardKeys, meKeys, freshnessKeys } from "@/lib/query-keys";
import { AssigneeMultiSelect } from "@/components/assignee-multi-select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { type BoardWidth } from "@/lib/status-groups";
import {
  canTransitionToStatus,
  findTransitionToStatus,
  transitionTarget,
} from "@/lib/jira/board-transitions";
import {
  Search,
  ListFilter,
  LayoutGrid,
  List,
  AlertTriangle,
  RefreshCw,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { EmptyState } from "@/components/shared/empty-state";
import { BoardSummaryCards } from "./board-summary-cards";
import { CardContent } from "./board-card";
import { BoardColumn, BoardSkeleton } from "./board-column";
import { QuickPanel } from "./board-quick-panel";
import {
  type Project,
  type SortMode,
  type QuickAction,
  type ViewMode,
  type Transition,
  type BoardSyncState,
} from "./lib/board-types";
import { daysSince, sortIssues, columnKeyForIssue, statusDot } from "./lib/board-utils";

export function BoardClient() {
  const qc = useQueryClient();
  const router = useRouter();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [activeDrag, setActiveDrag] = useState<IssueItem | null>(null);
  const activeDragKeyRef = useRef<string | null>(null);
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
  const [boardNewKey, setBoardNewKey] = useState("");
  const [boardValidating, setBoardValidating] = useState(false);
  const [boardValidateError, setBoardValidateError] = useState<string | null>(null);

  const savePrefs = useCallback(async (next: string[]) => {
    await api("/api/me/preferences", { method: "PUT", body: { projects: next } });
    await Promise.all([
      qc.invalidateQueries({ queryKey: meKeys.prefs }),
      qc.invalidateQueries({ queryKey: boardKeys.projects }),
    ]);
    setProject((prev) => (next.length > 0 && (!prev || !next.includes(prev)) ? next[0] : prev));
  }, [qc]);

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
        .filter((k) => availableKeys.includes(k) || effectivePreferred.includes(k))
        .map((k) => ({ key: k, openCount: countMap.get(k) ?? 0 })),
    [effectivePreferred, countMap, availableKeys]
  );

  const pickerActive = pickerSelection ?? effectivePreferred;
  const pickerSet = new Set(pickerActive);

  function openPicker() {
    setPickerSelection(effectivePreferred);
    setBoardValidateError(null);
    setShowPicker(true);
  }

  function closePicker() {
    setShowPicker(false);
    setPickerSelection(null);
    setBoardValidateError(null);
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

  async function handleAddProjectToBoard() {
    const key = boardNewKey.trim().toUpperCase();
    if (!key) return;
    setBoardValidating(true);
    setBoardValidateError(null);
    try {
      const res = await api<{ ok: boolean; error?: string; project?: { key: string; name: string } }>(
        "/api/projects/validate",
        { method: "POST", body: { key } }
      );
      if (!res.ok || !res.project) {
        setBoardValidateError(res.error ?? "Dự án không tồn tại trên Jira.");
        return;
      }
      const verifiedKey = res.project.key;
      const nextProjects = Array.from(new Set([...effectivePreferred, verifiedKey]));
      await savePrefs(nextProjects);
      setProject(verifiedKey);
      setBoardNewKey("");
      closePicker();
      setToast(`Đã thêm dự án ${res.project.name} (${verifiedKey}) và bắt đầu đồng bộ.`);
      try {
        await api("/api/sync/jira", { method: "POST", body: { projectKey: verifiedKey } });
      } catch {
        // queue failed or already queued
      }
    } catch (err: unknown) {
      setBoardValidateError((err as Error).message || "Lỗi kiểm tra dự án trên Jira.");
    } finally {
      setBoardValidating(false);
    }
  }
  const [view, setView] = useState<ViewMode>("board");
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(["me"]);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [quickPanel, setQuickPanel] = useState<IssueItem | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const selectedProject = effectivePreferred.includes(project) ? project : (effectivePreferred[0] ?? "");

  const boardQueriesEnabled =
    effectivePreferred.length > 0 && Boolean(selectedProject);

  const activeFilterCount =
    [q, label, priority].filter(Boolean).length +
    (selectedAssignees.length !== 1 || selectedAssignees[0] !== "me" ? 1 : 0);
  function resetFilters() {
    setQ("");
    setLabel("");
    setPriority("");
    setSelectedAssignees(["me"]);
  }

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

  const isAssigneeAll =
    selectedAssignees.length === 0 || selectedAssignees.includes("ALL");
  const boardFilters: import("@/hooks/use-issues").BoardFilters = {
    ...(selectedProject ? { project: selectedProject } : {}),
    q: q || undefined,
    label: label || undefined,
    priority: priority || undefined,
    assignee: isAssigneeAll ? "ALL" : selectedAssignees,
    includeDone: true,
    limit: 1000,
  };
  const { data, isLoading, isFetching } = useIssues(boardFilters, {
    enabled: boardQueriesEnabled,
  });

  const issueData: IssueSuccessResponse | null =
    data && "items" in data ? (data as IssueSuccessResponse) : null;

  const filterSig = JSON.stringify({
    p: selectedProject,
    q,
    label,
    priority,
    assignee: isAssigneeAll ? "ALL" : [...selectedAssignees].sort(),
  });
  const [extraPages, setExtraPages] = useState<{ sig: string; items: IssueItem[] }>({ sig: "", items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedTotal = issueData?.total ?? 0;

  const extraIssues = useMemo(
    () => (extraPages.sig === filterSig ? extraPages.items : []),
    [extraPages, filterSig]
  );
  const firstPageCount = issueData?.items.length ?? 0;
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

  const issues: IssueItem[] = useMemo(
    () => (issueData ? [...issueData.items, ...extraIssues] : [...extraIssues]),
    [issueData, extraIssues]
  );

  const [boardSync, setBoardSync] = useState<{
    projectKey: string;
    state: BoardSyncState;
    acceptedAt?: string;
    pollStartMs?: number;
  }>({
    projectKey: "",
    state: "idle",
  });

  const isCurrentProjectSyncing =
    boardSync.projectKey === selectedProject &&
    (boardSync.state === "enqueueing" ||
      boardSync.state === "queued" ||
      boardSync.state === "running");

  // Status polling effect when a sync is active
  useEffect(() => {
    if (boardSync.state !== "queued" && boardSync.state !== "running") return;
    const { projectKey, acceptedAt, pollStartMs = Date.now() } = boardSync;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function checkStatus() {
      const elapsed = Date.now() - pollStartMs;
      if (elapsed > 60_000) {
        if (!cancelled) {
          setToast("Chưa nhận được trạng thái đồng bộ. Hãy kiểm tra worker hoặc thử lại.");
          setBoardSync({ projectKey: "", state: "idle" });
        }
        return;
      }

      try {
        const queryParams = new URLSearchParams({ projectKey });
        if (acceptedAt) queryParams.set("since", acceptedAt);
        const res = await api<{
          projectKey: string;
          state: "queued" | "running" | "succeeded" | "failed" | "unknown";
          lastError: string | null;
        }>(`/api/sync/jira/status?${queryParams.toString()}`);

        if (cancelled) return;

        if (res.state === "succeeded") {
          void qc.invalidateQueries({ queryKey: issuesKeys.all });
          void qc.invalidateQueries({ queryKey: boardKeys.projects });
          void qc.invalidateQueries({ queryKey: freshnessKeys.all });
          setToast(`Đã đồng bộ ${projectKey}.`);
          setBoardSync({ projectKey, state: "succeeded" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 2000);
          return;
        }

        if (res.state === "failed") {
          const shortErr = res.lastError ? res.lastError.slice(0, 100) : "Lỗi đồng bộ";
          setToast(`Không thể đồng bộ ${projectKey}: ${shortErr}`);
          setBoardSync({ projectKey, state: "failed" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 3500);
          return;
        }

        if (res.state === "running" && boardSync.state !== "running") {
          setBoardSync((prev) => (prev.projectKey === projectKey ? { ...prev, state: "running" } : prev));
        }

        const nextDelay = elapsed < 15_000 ? 1000 : 2500;
        timer = setTimeout(checkStatus, nextDelay);
      } catch {
        if (!cancelled) {
          timer = setTimeout(checkStatus, 2500);
        }
      }
    }

    timer = setTimeout(checkStatus, 800);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [boardSync, qc]);

  async function syncJira() {
    if (!selectedProject || isCurrentProjectSyncing) return;
    const targetProject = selectedProject;
    setBoardSync({ projectKey: targetProject, state: "enqueueing" });
    setToast(`Đang gửi yêu cầu đồng bộ ${targetProject}…`);

    try {
      const res = await api<{
        state: "queued" | "already_running";
        acceptedAt: string;
      }>("/api/sync/jira", {
        method: "POST",
        body: { projectKey: targetProject },
      });

      if (res.state === "already_running") {
        setToast(`${targetProject} đang được đồng bộ. Dữ liệu sẽ tự cập nhật khi hoàn tất.`);
      } else {
        setToast(`${targetProject} đang chờ đồng bộ.`);
      }

      setBoardSync({
        projectKey: targetProject,
        state: "queued",
        acceptedAt: res.acceptedAt || new Date().toISOString(),
        pollStartMs: Date.now(),
      });
    } catch (error) {
      setToast(`Không thể đồng bộ ${targetProject}: ${(error as Error).message.slice(0, 100)}`);
      setBoardSync({ projectKey: "", state: "idle" });
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
      if (typing) return;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, quickPanel]);

  const { data: statusesData, isLoading: isLoadingStatuses } = useQuery({
    queryKey: boardKeys.statuses(selectedProject),
    enabled: boardQueriesEnabled,
    queryFn: () =>
      api<{
        projectKey?: string;
        source?: string;
        columns?: Array<{
          id: string;
          name: string;
          statusIds: string[];
          statuses: Array<{ id: string; name: string }>;
          category?: string;
          isBacklog: boolean;
          isDone: boolean;
        }>;
        backlogColumnId?: string | null;
        backlogStatusIds?: string[];
        items?: { name: string; category: string }[];
        statusCategoryMap: Record<string, string>;
      }>(
        `/api/board/statuses?project=${selectedProject}`
      ),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const statusCategoryMap = useMemo<Record<string, string>>(
    () => statusesData?.statusCategoryMap ?? {},
    [statusesData?.statusCategoryMap]
  );

  type Column = {
    key: string;
    label: string;
    category: string;
    isDone: boolean;
    isBacklog: boolean;
    statusIds: string[];
    statuses: Array<{ id: string; name: string }>;
  };

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [];
    const seenColKeys = new Set<string>();
    const seenStatusNames = new Set<string>();

    if (statusesData?.columns && statusesData.columns.length > 0) {
      for (const c of statusesData.columns) {
        cols.push({
          key: c.id,
          label: c.name,
          category: c.isDone ? "done" : (statusCategoryMap[c.name] ?? "new"),
          isDone: c.isDone,
          isBacklog: c.isBacklog,
          statusIds: c.statusIds ?? [],
          statuses: c.statuses ?? [],
        });
        seenColKeys.add(c.id);
        seenStatusNames.add(c.name.toLowerCase());
        for (const s of c.statuses ?? []) {
          seenStatusNames.add(s.name.toLowerCase());
        }
      }
    }

    // Dynamic runtime column creation: if an issue has a status not present in workflow columns,
    // add a runtime column so it never gets lost or placed in the wrong column
    for (const issue of issues) {
      const sId = (issue.statusId || "").trim();
      const sName = (issue.status || "").trim();
      const key = sId ? `status:${sId}` : `status:${sName}`;
      if (!seenColKeys.has(key) && !seenStatusNames.has(sName.toLowerCase())) {
        seenColKeys.add(key);
        seenStatusNames.add(sName.toLowerCase());
        const cat = issue.statusCategory || statusCategoryMap[sName] || "new";
        cols.push({
          key,
          label: sName || (sId ? `Status ${sId}` : "Khác"),
          category: cat,
          isDone: cat === "done",
          isBacklog: false,
          statusIds: sId ? [sId] : [],
          statuses: sId ? [{ id: sId, name: sName }] : [],
        });
      }
    }

    if (cols.length === 0) {
      return [
        { key: "status:todo", label: "To Do", category: "new", isDone: false, isBacklog: false, statusIds: [], statuses: [] },
        { key: "status:inprogress", label: "In Progress", category: "indeterminate", isDone: false, isBacklog: false, statusIds: [], statuses: [] },
        { key: "status:done", label: "Done", category: "done", isDone: true, isBacklog: false, statusIds: [], statuses: [] },
      ];
    }

    return cols;
  }, [statusesData, statusCategoryMap, issues]);

  const [optimistic, setOptimistic] = useState<Map<string, string>>(new Map());

  function setOptimisticStatus(key: string, status: string | null) {
    setOptimistic((prev) => {
      const next = new Map(prev);
      if (status === null) next.delete(key);
      else next.set(key, status);
      return next;
    });
  }

  const columnKeyByStatusId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) {
      for (const sId of c.statusIds) {
        m.set(sId, c.key);
      }
    }
    return m;
  }, [columns]);

  const columnKeyByStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) {
      m.set(c.label, c.key);
      for (const s of c.statuses) {
        m.set(s.name, c.key);
      }
    }
    return m;
  }, [columns]);

  function findColumnForIssue(issue: IssueItem): string {
    const effective = optimistic.has(issue.jiraKey)
      ? ({ ...issue, status: optimistic.get(issue.jiraKey)! } as IssueItem)
      : issue;
    return columnKeyForIssue(
      effective,
      columnKeyByStatus,
      statusCategoryMap,
      columns,
      columnKeyByStatusId
    );
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
  const transitionRequests = useRef(new Map<string, Promise<Transition[]>>());
  const [allowedCols, setAllowedCols] = useState<Set<string> | null>(null);

  function toName(tr: Transition): string {
    return transitionTarget(tr);
  }

  const fetchTransitions = useCallback(async (key: string) => {
    if (transitionCache.current.has(key)) {
      return transitionCache.current.get(key)!;
    }
    if (transitionRequests.current.has(key)) {
      return transitionRequests.current.get(key)!;
    }
    const request = api<{ transitions: Transition[] }>(`/api/issues/${key}/transitions`)
      .then((result) => {
        transitionCache.current.set(key, result.transitions);
        return result.transitions;
      })
      .finally(() => transitionRequests.current.delete(key));
    transitionRequests.current.set(key, request);
    return request;
  }, []);

  function invalidateTransitionCache(key: string) {
    transitionCache.current.delete(key);
    transitionRequests.current.delete(key);
  }

  const transitionKeys = useMemo(() => issues.map((i) => i.jiraKey).join("|"), [issues]);
  useEffect(() => {
    const keys = transitionKeys ? transitionKeys.split("|") : [];
    let cancelled = false;
    void (async () => {
      for (const key of keys) {
        if (cancelled) return;
        if (transitionCache.current.has(key)) continue;
        try {
          await fetchTransitions(key);
        } catch {
          // Leave it uncached; drag-start and transition execution retry it.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transitionKeys, fetchTransitions]);

  function canDropTo(
    all: Transition[],
    targetLabel: string,
    targetCat: string | undefined,
    targetKey: string
  ): boolean {
    if (canTransitionToStatus(all, targetLabel)) {
      return true;
    }
    const targetCol = columns.find((c) => c.key === targetKey);
    if (targetCol && targetCol.statuses.length > 0) {
      for (const st of targetCol.statuses) {
        if (canTransitionToStatus(all, st.name)) return true;
      }
    }
    if (targetCat && targetKey !== targetLabel) {
      return all.some((tr) => {
        const t = toName(tr);
        return (statusCategoryMap[t] ?? statusCategoryMap[t.toLowerCase()]) === targetCat;
      });
    }
    return false;
  }

  function findTransition(all: Transition[], targetLabel: string, targetKey?: string): Transition | null {
    const exact = findTransitionToStatus(all, targetLabel);
    if (exact) return exact;
    if (targetKey) {
      const targetCol = columns.find((c) => c.key === targetKey);
      if (targetCol && targetCol.statuses.length > 0) {
        for (const st of targetCol.statuses) {
          const match = findTransitionToStatus(all, st.name);
          if (match) return match;
        }
      }
    }
    const targetCat = columns.find((c) => c.key === (targetKey ?? targetLabel))?.category;
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
      setOptimisticStatus(key, revertTo);
      if (status === 403 || status === 401) {
        setToast(`${key}: You don't have permission to make this transition.`);
        return;
      }
      if (status === 409) {
        setToast(`${key}: This transition isn't available from the current state. Move it via Jira.`);
        return;
      }
      setToast(`${key}: Couldn't update Jira. The card has been reverted. Try again, or make the change in Jira.`);
      return;
    }
    invalidateTransitionCache(key);
    setOptimisticStatus(key, null);
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
  }

  async function handleTransition(key: string, target: string) {
    setTransitionBusy(true);
    setToast(null);
    try {
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

      if (issue && findColumnForIssue(issue) === targetKey) {
        setTransitionBusy(false);
        return;
      }

      const all = await fetchTransitions(key);
      const found = findTransition(all, targetLabel, targetKey);

      if (!found) {
        setToast(
          `${key}: "${issue?.status || "current"}" cannot move to ${targetLabel}. The workflow doesn't allow this transition.`
        );
        return;
      }

      const targetStatusName = transitionTarget(found);
      setOptimisticStatus(key, targetStatusName);
      await doTransition(key, found.id, fromStatus);
    } catch (e) {
      setOptimisticStatus(key, null);
      setToast(`${key}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setTransitionBusy(false);
    }
  }

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
    activeDragKeyRef.current = null;
    setAllowedCols(null);
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const key = String(active.id);
    const targetColumn = String(over.id);
    const source = issues.find((i) => i.jiraKey === key);
    if (!source) return;
    const currentCol = findColumnForIssue(source);
    if (currentCol === targetColumn) return;
    handleTransition(key, targetColumn);
  }

  function collisionDetection(args: Parameters<CollisionDetection>[0]): ReturnType<CollisionDetection> {
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

  function onDragStart(key: string) {
    const issue = issues.find((item) => item.jiraKey === key) ?? null;
    activeDragKeyRef.current = issue?.jiraKey ?? null;
    setActiveDrag(issue);
    setAllowedCols(null);
    if (!issue) return;

    void fetchTransitions(issue.jiraKey)
      .then((all) => {
        if (activeDragKeyRef.current !== issue.jiraKey) return;
        const currentCol = findColumnForIssue(issue);
        setAllowedCols(
          new Set(
            columns
              .filter((column) =>
                column.key === currentCol ||
                canDropTo(all, column.label, column.category, column.key)
              )
              .map((column) => column.key)
          )
        );
      })
      .catch(() => {
        // `handleTransition` reports the actionable error if the user drops.
      });
  }

  const colResetSig = useMemo(
    () => `${selectedProject}|${sortMode}|${filterSig}|${issues.length}`,
    [selectedProject, sortMode, filterSig, issues.length]
  );
  const colVisible = useMemo(
    () => (colVisibleState.sig === colResetSig ? colVisibleState.counts : {}),
    [colVisibleState, colResetSig]
  );

  const WIP_LIMIT = 8;

  const boardColumnsRender = useMemo(() => {
    const seen = new Map<string, number>();
    return columns.map((c, i) => {
      const idxInCat = seen.get(c.category) ?? 0;
      seen.set(c.category, idxInCat + 1);
      const all = sortedByColumn.get(c.key) ?? [];
      const count = colVisible[c.key] ?? COL_BATCH;
      const emptyMessage = c.isBacklog
        ? (activeFilterCount > 0 ? "Không có task Backlog khớp bộ lọc" : "Không có task Backlog")
        : undefined;
      return {
        id: c.key,
        label: c.label,
        category: c.category,
        isDone: c.isDone,
        isBacklog: c.isBacklog,
        emptyMessage,
        colIndex: i,
        columnCount: columns.length,
        dotColor: statusDot(c.category, idxInCat),
        items: all.slice(0, count),
        total: all.length,
        wipOver: c.category === "indeterminate" && all.length > WIP_LIMIT,
        collapsed: collapsedCols.has(c.key),
      };
    });
  }, [columns, sortedByColumn, colVisible, collapsedCols, activeFilterCount]);

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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ListFilter className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Chưa chọn dự án nào</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Chọn các dự án Jira muốn hiển thị trên bảng, hoặc nhập mã dự án bên dưới để bắt đầu.
        </p>

        <div className="mt-2 flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs">
          <Label className="text-left text-xs font-semibold text-foreground">
            Nhập mã dự án Jira muốn có
          </Label>
          <div className="flex gap-2">
            <Input
              value={boardNewKey}
              onChange={(e) => {
                setBoardNewKey(e.target.value.toUpperCase());
                setBoardValidateError(null);
              }}
              placeholder="VD: ABC, MOBILE..."
              className="h-8 font-mono text-xs uppercase"
              disabled={boardValidating}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddProjectToBoard();
                }
              }}
            />
            <Button
              size="sm"
              disabled={boardValidating || !boardNewKey.trim()}
              onClick={() => void handleAddProjectToBoard()}
              className="h-8 shrink-0 cursor-pointer text-xs gap-1.5"
            >
              {boardValidating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Kiểm tra & Thêm
            </Button>
          </div>
          {boardValidateError && (
            <p className="text-left text-xs font-medium text-destructive">{boardValidateError}</p>
          )}
        </div>

        {availableKeys.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowPicker(true)} className="cursor-pointer gap-1.5">
            <ListFilter className="h-4 w-4" /> Chọn từ danh sách có sẵn
          </Button>
        )}
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
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm font-medium shadow-lg ring-1 ring-black/5 dark:ring-white/5"
        >
          {toast}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {projectList.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setProject(p.key);
              }}
              className={tabCls(selectedProject === p.key)}
            >
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
              {effectivePreferred.length > 0 ? `${effectivePreferred.length} đã chọn` : "Chọn dự án"}
            </button>
            {showPicker && (
              <Card className="absolute left-0 top-full z-20 mt-1 w-72 p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Hiển thị dự án trên bảng
                </p>
                <div className="flex max-h-56 flex-col gap-1 overflow-auto">
                  {availableKeys.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox checked={pickerSet.has(key)} onCheckedChange={() => togglePicker(key)} />
                      <span className="flex-1 font-medium">{key}</span>
                      <span className="text-xs text-muted-foreground">{countMap.get(key) ?? 0}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-2.5 border-t border-border pt-2.5">
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                    Nhập dự án muốn có
                  </p>
                  <div className="flex gap-1.5">
                    <Input
                      value={boardNewKey}
                      onChange={(e) => {
                        setBoardNewKey(e.target.value.toUpperCase());
                        setBoardValidateError(null);
                      }}
                      placeholder="Mã dự án (VD: ABC)"
                      className="h-8 font-mono text-xs uppercase"
                      disabled={boardValidating}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddProjectToBoard();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={boardValidating || !boardNewKey.trim()}
                      onClick={() => void handleAddProjectToBoard()}
                      className="h-8 shrink-0 cursor-pointer px-2.5 text-xs gap-1"
                    >
                      {boardValidating ? (
                        <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Thêm
                    </Button>
                  </div>
                  {boardValidateError && (
                    <p className="mt-1 text-[11px] font-medium text-destructive">{boardValidateError}</p>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
                  <button
                    onClick={() => setPickerSelection(availableKeys)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Chọn tất cả
                  </button>
                  <Button size="sm" variant="ghost" onClick={commitPicker}>
                    Xong
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
            disabled={isCurrentProjectSyncing}
            className="gap-1.5 cursor-pointer"
            title={
              isCurrentProjectSyncing
                ? boardSync.state === "enqueueing"
                  ? `Đang gửi yêu cầu đồng bộ ${selectedProject}…`
                  : boardSync.state === "running"
                  ? `Đang đồng bộ Jira cho ${selectedProject}…`
                  : `${selectedProject} đang chờ đồng bộ.`
                : `Đồng bộ Jira cho ${selectedProject}`
            }
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (isCurrentProjectSyncing || isFetching) && "animate-spin motion-reduce:animate-none"
              )}
            />
            {boardSync.projectKey === selectedProject && boardSync.state === "enqueueing"
              ? "Đang gửi…"
              : boardSync.projectKey === selectedProject && boardSync.state === "queued"
              ? "Đang chờ…"
              : boardSync.projectKey === selectedProject && boardSync.state === "running"
              ? "Đang đồng bộ…"
              : boardSync.projectKey === selectedProject && boardSync.state === "succeeded"
              ? "Đã đồng bộ"
              : "Đồng bộ Jira"}
          </Button>
          <SegmentedControl<ViewMode>
            items={[
              { value: "board", label: "Bảng", icon: LayoutGrid, disabled: width === "narrow" },
              { value: "list", label: "Danh sách", icon: List },
            ]}
            value={effectiveView}
            onChange={setView}
            aria-label="Chế độ hiển thị"
          />

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

      {issueData?.sync.stale && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Dữ liệu Jira chưa được đồng bộ mới</p>
            <p className="text-xs opacity-90">
              Đồng bộ thành công lần cuối: {issueData.sync.lastSuccessAt ? timeAgo(issueData.sync.lastSuccessAt) : "chưa từng"}.
              Hãy xếp hàng đồng bộ hoặc kiểm tra worker trước khi ra quyết định phát hành.
            </p>
          </div>
        </div>
      )}


      <FilterBar activeCount={activeFilterCount} onReset={resetFilters}>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={`Tìm kiếm trong ${selectedProject}…`}
          ariaLabel={`Tìm kiếm trong ${selectedProject}`}
          className="flex-1 min-w-[220px]"
        />
        <AssigneeMultiSelect
          value={selectedAssignees}
          onChange={setSelectedAssignees}
          assignees={assignees}
          myName={myName}
        />
        <div className="flex items-center gap-1.5 self-center text-xs text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground border border-border/40">
            Backlog luôn hiển thị toàn bộ task của dự án
          </span>
        </div>
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
      </FilterBar>

      <BoardSummaryCards summary={summary} loading={isLoading} />

      {activeProject && (
        <div className="text-sm text-muted-foreground">
          Dự án <span className="font-semibold text-foreground">{activeProject.key}</span>
          {" "}· {issues.length} task
          {issueData?.sync.lastSuccessAt ? (
            <>
              {" "}· Đồng bộ <span className="font-medium text-foreground">{timeAgo(issueData.sync.lastSuccessAt)}</span>
            </>
          ) : null}
        </div>
      )}

      {isLoading || isLoadingStatuses ? (
        <BoardSkeleton columnCount={columns.length || 5} />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có task nào để hiển thị"
          hint="Hãy thử điều chỉnh bộ lọc, hoặc làm mới dữ liệu để cập nhật bảng."
          className="flex-1"
        />
      ) : effectiveView === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={(e) => onDragStart(String(e.active.id))}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            activeDragKeyRef.current = null;
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
                isBacklog={col.isBacklog}
                emptyMessage={col.emptyMessage}
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
          <DragOverlay>
            {activeDrag ? (
              <CardContent issue={activeDrag} done={false} dragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Assignee</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.jiraKey}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/30"
                  onClick={() => setQuickPanel(issue)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-primary">{issue.jiraKey}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-medium">{issue.summary}</td>
                  <td className="px-3 py-2 text-muted-foreground">{issue.status}</td>
                  <td className="px-3 py-2 text-muted-foreground">{issue.assigneeJira ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{issue.priority ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{timeAgo(issue.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="border-t p-3 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Đang tải…" : "Xem thêm"}
              </Button>
            </div>
          )}
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

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-[1px]"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border bg-popover shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={paletteQ}
              onChange={(e) => setPaletteQ(e.target.value)}
              placeholder="Nhập key hoặc summary…"
              className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-72 overflow-auto p-1">
              {paletteResults.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">Không tìm thấy</p>
              ) : (
                paletteResults.map((i) => (
                  <button
                    key={i.jiraKey}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setPaletteOpen(false);
                      router.push(`/issue/${i.jiraKey}`);
                    }}
                  >
                    <span className="font-mono text-xs text-primary">{i.jiraKey}</span>
                    <span className="truncate text-muted-foreground">{i.summary}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
