"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { issuesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import {
  type IssueFilters,
  DEFAULT_BOARD_FILTERS,
  effectiveAssignees,
  countActiveIssueFilters,
  parseIssueFilters,
  serializeIssueFilters,
} from "@/lib/issues/issue-filters";
import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import {
  loadStoredFilters,
  loadStoredProject,
  loadStoredSortMode,
  loadStoredViewMode,
  saveStoredFilters,
  saveStoredProject,
  saveStoredSortMode,
  saveStoredViewMode,
} from "./lib/board-storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transitionTarget } from "@/lib/jira/board-transitions";
import { Search, LayoutGrid, List, ChevronsUpDown } from "lucide-react";
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
} from "./lib/board-types";
import { sortIssues, columnKeyForIssue } from "./lib/board-utils";
import { BoardProjectSummaryLine, HiddenColumnsBanner, StaleSyncBanner } from "./board-banners";
import { BoardColumnsMenu } from "./board-columns-menu";
import { BoardNoProjectsState } from "./board-empty-projects";
import { BoardListView } from "./board-list-view";
import { BoardProjectTabs } from "./board-project-tabs";
import { BoardSyncButton } from "./board-sync-button";
import {
  COL_BATCH,
  allowedColumnKeys,
  buildColumns,
  buildColumnViews,
  findTransition,
  indexColumnsByStatus,
  indexColumnsByStatusId,
  summarizeBoard,
  type BoardStatusesResponse,
} from "./lib/board-columns";
import {
  useBoardWidth,
  useColumnPreferences,
  useDragAutoScroll,
  useJiraSync,
  useTransitionCache,
} from "./lib/board-hooks";

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

  useDragAutoScroll(boardScrollRef, activeDrag, dragOverCol);

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

  const searchParams = useSearchParams();
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";
  const hasFilterParamsInUrl = Boolean(
    searchParams &&
      Array.from(searchParams.keys()).some((k) => k !== "project")
  );

  const [project, setProject] = useState<string>(() => {
    if (urlProject) return urlProject;
    return loadStoredProject() || "";
  });
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

  const selectedProject = effectivePreferred.includes(project)
    ? project
    : (effectivePreferred[0] ?? "");

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

  function handleSelectProject(nextKey: string) {
    if (nextKey === selectedProject) return;
    if (selectedProject) {
      saveStoredFilters(selectedProject, filters);
    }
    setProject(nextKey);
    saveStoredProject(nextKey);
    const saved = loadStoredFilters(nextKey, myName);
    if (saved) {
      setFilters(saved);
    } else {
      setFilters({
        ...DEFAULT_BOARD_FILTERS,
        project: nextKey,
      });
    }
  }

  async function handleAddProjectToBoard() {
    const key = boardNewKey.trim().toUpperCase();
    if (!key) return;
    setBoardValidating(true);
    setBoardValidateError(null);
    try {
      const res = await api<{
        ok: boolean;
        error?: string;
        created?: boolean;
        project?: { key: string; name: string };
        bootstrap?: { state: string };
      }>("/api/projects", { method: "POST", body: { key } });

      if (!res.ok || !res.project) {
        setBoardValidateError(res.error ?? "Dự án không tồn tại trên Jira.");
        return;
      }
      const verifiedKey = res.project.key;
      await Promise.all([
        qc.invalidateQueries({ queryKey: meKeys.prefs }),
        qc.invalidateQueries({ queryKey: boardKeys.projects }),
        qc.invalidateQueries({ queryKey: ["board", "statuses", verifiedKey] }),
      ]);
      setBoardNewKey("");
      closePicker();
      handleSelectProject(verifiedKey);
      setToast(`Đã thêm dự án ${res.project.name} (${verifiedKey}) và bắt đầu đồng bộ.`);
    } catch (err: unknown) {
      setBoardValidateError((err as Error).message || "Lỗi kiểm tra dự án trên Jira.");
    } finally {
      setBoardValidating(false);
    }
  }

  function handleBoardNewKeyChange(value: string) {
    setBoardNewKey(value.toUpperCase());
    setBoardValidateError(null);
  }

  const [view, setView] = useState<ViewMode>(() => {
    return loadStoredViewMode() ?? "board";
  });
  const [filters, setFilters] = useState<IssueFilters>(() => {
    if (searchParams && hasFilterParamsInUrl) {
      return parseIssueFilters(searchParams, DEFAULT_BOARD_FILTERS, myName);
    }
    const initialPrj = urlProject || loadStoredProject() || "";
    if (initialPrj) {
      const saved = loadStoredFilters(initialPrj, myName);
      if (saved) return saved;
    }
    return DEFAULT_BOARD_FILTERS;
  });

  // When selectedProject changes, ensure it is saved in storage
  useEffect(() => {
    if (selectedProject) {
      saveStoredProject(selectedProject);
    }
  }, [selectedProject]);

  // Initial sync when selectedProject resolves after async preferences load
  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (!initialSyncDoneRef.current && selectedProject && !hasFilterParamsInUrl) {
      initialSyncDoneRef.current = true;
      const saved = loadStoredFilters(selectedProject, myName);
      if (saved) {
        setFilters(saved);
      }
    }
  }, [selectedProject, myName, hasFilterParamsInUrl]);

  // Re-sync with myName if loaded subsequently
  const myNameSyncedRef = useRef(false);
  useEffect(() => {
    if (myName && !myNameSyncedRef.current) {
      myNameSyncedRef.current = true;
      setFilters((prev) => {
        if (hasFilterParamsInUrl && searchParams) {
          return parseIssueFilters(searchParams, prev, myName);
        }
        if (selectedProject) {
          const saved = loadStoredFilters(selectedProject, myName);
          if (saved) return saved;
        }
        return prev;
      });
    }
  }, [myName, searchParams, hasFilterParamsInUrl, selectedProject]);

  // Save filters to localStorage whenever filters or selectedProject change
  useEffect(() => {
    if (selectedProject) {
      saveStoredFilters(selectedProject, filters);
    }
  }, [filters, selectedProject]);

  // Sync URL when filters change (debounced for search text)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const filtersWithProject: IssueFilters = {
        ...filters,
        project: selectedProject,
      };
      const sp = serializeIssueFilters(filtersWithProject, DEFAULT_BOARD_FILTERS);
      if (selectedProject) {
        sp.set("project", selectedProject);
      }
      const qs = sp.toString();
      const currentUrl = window.location.pathname + (window.location.search || "");
      const targetUrl = window.location.pathname + (qs ? `?${qs}` : "");
      if (currentUrl !== targetUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, selectedProject, router]);

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return loadStoredSortMode() ?? "updated";
  });
  useEffect(() => {
    saveStoredSortMode(sortMode);
  }, [sortMode]);

  useEffect(() => {
    saveStoredViewMode(view);
  }, [view]);

  const [quickPanel, setQuickPanel] = useState<IssueItem | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const boardQueriesEnabled =
    effectivePreferred.length > 0 && Boolean(selectedProject);

  const activeFilterCount = countActiveIssueFilters(filters, DEFAULT_BOARD_FILTERS);

  const [colVisibleState, setColVisibleState] = useState<{ sig: string; counts: Record<string, number> }>({
    sig: "",
    counts: {},
  });

  const width = useBoardWidth();

  const effectiveView: ViewMode = width === "narrow" ? "list" : view;


  const activeAssignees = effectiveAssignees(filters.assigneeScope);
  const isAssigneeAll = activeAssignees === "ALL";
  const boardFilters: import("@/hooks/use-issues").BoardFilters = {
    ...(selectedProject ? { project: selectedProject } : {}),
    q: filters.query || undefined,
    label: filters.labels.length > 0 ? filters.labels : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    assignee: isAssigneeAll ? "ALL" : activeAssignees,
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
    q: filters.query,
    label: [...filters.labels].sort(),
    priority: [...filters.priorities].sort(),
    assignee: isAssigneeAll ? "ALL" : [...activeAssignees].sort(),
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

  const { boardSync, isCurrentProjectSyncing, syncJira } = useJiraSync(selectedProject, setToast);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key === "Escape" && quickPanel) {
        setQuickPanel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickPanel]);

  const { data: statusesData, isLoading: isLoadingStatuses } = useQuery({
    queryKey: boardKeys.statuses(selectedProject),
    enabled: boardQueriesEnabled,
    queryFn: () =>
      api<BoardStatusesResponse>(`/api/board/statuses?project=${selectedProject}`),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const statusCategoryMap = useMemo<Record<string, string>>(
    () => statusesData?.statusCategoryMap ?? {},
    [statusesData?.statusCategoryMap]
  );

  const columns = useMemo(
    () => buildColumns(statusesData, statusCategoryMap, issues),
    [statusesData, statusCategoryMap, issues]
  );

  const [optimistic, setOptimistic] = useState<Map<string, string>>(new Map());

  function setOptimisticStatus(key: string, status: string | null) {
    setOptimistic((prev) => {
      const next = new Map(prev);
      if (status === null) next.delete(key);
      else next.set(key, status);
      return next;
    });
  }

  const columnKeyByStatusId = useMemo(() => indexColumnsByStatusId(columns), [columns]);

  const columnKeyByStatus = useMemo(() => indexColumnsByStatus(columns), [columns]);

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

  const summary = useMemo(
    () => summarizeBoard(columns, byColumn, issues),
    [columns, byColumn, issues]
  );

  const activeProject = projectList.find((p) => p.key === selectedProject) ?? null;

  const {
    hiddenCols,
    collapsedCols,
    visibleColumns,
    toggleCollapse,
    hideColumn,
    showColumn,
    showAllColumns,
    toggleColumnVisibility,
    hideEmptyColumns,
    collapseEmptyColumns,
    expandAllCollapsedColumns,
    resetColumnPreferences,
  } = useColumnPreferences(selectedProject, columns, byColumn);

  const columnKeys = useMemo(() => visibleColumns.map((c) => c.key), [visibleColumns]);

  const { transitionCache, fetchTransitions, invalidateTransitionCache } = useTransitionCache(issues);
  const [allowedCols, setAllowedCols] = useState<Set<string> | null>(null);

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
      const found = findTransition(columns, statusCategoryMap, all, targetLabel, targetKey);

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
              const t = transitionTarget(tr);
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
      const msg = err.status ? `update failed (HTTP ${err.status})` : err.message;
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
    const allowed = allowedColumnKeys(columns, statusCategoryMap, currentCol, all);
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
    setAllowedCols(allowedColumnKeys(columns, statusCategoryMap, currentCol, all));
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
        setAllowedCols(allowedColumnKeys(columns, statusCategoryMap, currentCol, all));
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

  const boardColumnsRender = useMemo(
    () => buildColumnViews(visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount),
    [visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount]
  );

  function growColumn(colId: string) {
    setColVisibleState((prev) => {
      const counts = prev.sig === colResetSig ? { ...prev.counts } : {};
      counts[colId] = (counts[colId] ?? COL_BATCH) + COL_BATCH;
      return { sig: colResetSig, counts };
    });
  }

  const [hiddenTableCols, setHiddenTableCols] = useState<Set<string>>(new Set());
  function toggleTableColumn(colKey: string) {
    setHiddenTableCols((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
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
      <BoardNoProjectsState
        boardNewKey={boardNewKey}
        boardValidating={boardValidating}
        boardValidateError={boardValidateError}
        hasAvailableKeys={availableKeys.length > 0}
        onKeyChange={handleBoardNewKeyChange}
        onAddProject={handleAddProjectToBoard}
        onPickFromList={() => setShowPicker(true)}
      />
    );
  }

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
          <BoardProjectTabs
            projectList={projectList}
            selectedProject={selectedProject}
            showPicker={showPicker}
            preferredCount={effectivePreferred.length}
            availableKeys={availableKeys}
            pickerSet={pickerSet}
            countMap={countMap}
            boardNewKey={boardNewKey}
            boardValidating={boardValidating}
            boardValidateError={boardValidateError}
            onSelectProject={handleSelectProject}
            onOpenPicker={openPicker}
            onClosePicker={closePicker}
            onTogglePicker={togglePicker}
            onSelectAllKeys={() => setPickerSelection(availableKeys)}
            onCommit={commitPicker}
            onKeyChange={handleBoardNewKeyChange}
            onAddProject={handleAddProjectToBoard}
          />

        </div>

        <div className="flex items-center gap-2">
          <BoardSyncButton
            boardSync={boardSync}
            selectedProject={selectedProject}
            isCurrentProjectSyncing={isCurrentProjectSyncing}
            isFetching={isFetching}
            onSync={syncJira}
          />
          <SegmentedControl<ViewMode>
            items={[
              { value: "board", label: "Bảng", icon: LayoutGrid, disabled: width === "narrow" },
              { value: "list", label: "Danh sách", icon: List },
            ]}
            value={effectiveView}
            onChange={setView}
            aria-label="Chế độ hiển thị"
          />

          <BoardColumnsMenu
            effectiveView={effectiveView}
            columns={columns}
            visibleColumns={visibleColumns}
            byColumn={byColumn}
            hiddenCols={hiddenCols}
            collapsedCols={collapsedCols}
            hiddenTableCols={hiddenTableCols}
            selectedProject={selectedProject}
            onShowAll={showAllColumns}
            onHideEmpty={hideEmptyColumns}
            onToggleColumn={toggleColumnVisibility}
            onCollapseEmpty={collapseEmptyColumns}
            onExpandAll={expandAllCollapsedColumns}
            onResetColumns={resetColumnPreferences}
            onToggleTableColumn={toggleTableColumn}
            onResetTableColumns={() => setHiddenTableCols(new Set())}
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
        </div>
      </div>

      {issueData?.sync.stale && <StaleSyncBanner lastSuccessAt={issueData.sync.lastSuccessAt} />}

      <IssueFilterBar
        value={filters}
        defaults={DEFAULT_BOARD_FILTERS}
        onChange={setFilters}
        options={{
          assignees,
          labels: labelOptions,
          priorities: optData?.priorities ?? ["Low", "Medium", "High", "Highest", "Blocker"],
        }}
        capabilities={{
          search: true,
          assignee: "multi",
          status: false,
          label: "single",
          priority: "single",
          quickSwitch: true,
        }}
        myName={myName}
        searchPlaceholder={`Tìm kiếm trong ${selectedProject}…`}
      />

      <BoardSummaryCards summary={summary} loading={isLoading} />

      {activeProject && (
        <BoardProjectSummaryLine
          projectKey={activeProject.key}
          issueCount={issues.length}
          lastSuccessAt={issueData?.sync.lastSuccessAt}
        />
      )}

      {effectiveView === "board" && hiddenCols.size > 0 && (
        <HiddenColumnsBanner
          columns={columns}
          hiddenCols={hiddenCols}
          onShowColumn={showColumn}
          onShowAll={showAllColumns}
        />
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
                canHide={visibleColumns.length > 1}
                total={col.total}
                onGrow={growColumn}
                onToggleCollapse={toggleCollapse}
                onHideColumn={hideColumn}
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
        <BoardListView
          issues={issues}
          hiddenTableCols={hiddenTableCols}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onOpen={setQuickPanel}
          onLoadMore={loadMore}
        />
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
