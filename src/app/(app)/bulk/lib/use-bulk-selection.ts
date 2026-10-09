"use client";

import { useMemo, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useIssues, useMoreIssues, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import { scopeProjectItems } from "@/lib/project-scope-client";
import { type IssueFilters, DEFAULT_BULK_FILTERS } from "@/lib/issues/issue-filters";
import {
  deriveAssigneeOptions,
  deriveEpicOptions,
  deriveLabelOptions,
  derivePriorityOptions,
  filterAndSortIssues,
  resolveInitialProject,
  withPlaceholderIssues,
  type BulkFiltersResponse,
  type SelectionMode,
  type SortOption,
} from "./bulk-logic";

export interface UseBulkSelectionOptions {
  searchParams?: ReadonlyURLSearchParams | null;
  sessionUsername?: string | null;
  onProjectChange?: () => void;
}

export function useBulkSelection({
  searchParams,
  sessionUsername,
  onProjectChange,
}: UseBulkSelectionOptions = {}) {
  const returnTo = searchParams?.get("returnTo");

  const initialKeys = useMemo(() => {
    const raw = searchParams?.get("keys");
    if (!raw) return [];
    return raw
      .split(",")
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
  }, [searchParams]);

  const initialKeysSet = useMemo(() => new Set(initialKeys), [initialKeys]);
  const initialKeyIndexMap = useMemo(
    () => new Map(initialKeys.map((k, idx) => [k, idx])),
    [initialKeys]
  );

  const initialProjectFromUrl = useMemo(() => {
    const p = searchParams?.get("project");
    if (p) return p.trim().toUpperCase();
    if (initialKeys.length > 0) {
      return initialKeys[0].split("-")[0] ?? "";
    }
    return "";
  }, [searchParams, initialKeys]);

  // Project scope (MANDATORY)
  const [filterProject, setFilterProject] = useState(initialProjectFromUrl);

  // Load issues from cache directly scoped to the selected project
  const bulkFilters = useMemo(
    () => ({ project: filterProject, includeDone: true, limit: 1000, assignee: "all" }),
    [filterProject]
  );
  const { data, isLoading, isFetching } = useIssues(bulkFilters, { enabled: Boolean(filterProject) });
  const firstPage = data && "items" in data ? data : null;
  const {
    items: extraIssues,
    loading: isLoadingMore,
    loadMore: handleLoadMore,
  } = useMoreIssues(bulkFilters, firstPage);

  const issues: IssueItem[] = useMemo(
    () => (firstPage ? [...firstPage.items, ...extraIssues] : extraIssues),
    [firstPage, extraIssues]
  );

  const totalServerIssues = firstPage ? firstPage.total : issues.length;
  const isIssuesLoading = isLoading || (Boolean(filterProject) && isFetching && issues.length === 0);

  // Load distinct filter options for the project from server
  const { data: filtersData } = useQuery({
    queryKey: issuesKeys.filters(filterProject || "bulk"),
    queryFn: () =>
      api<BulkFiltersResponse>(
        `/api/issues/filters?project=${encodeURIComponent(filterProject)}`
      ),
    enabled: Boolean(filterProject),
    staleTime: 60_000,
    retry: 0,
  });

  // Jira base URL for deep links
  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    retry: 0,
  });
  const jiraBaseUrl = (meStatus?.jiraBaseUrl ?? "").replace(/\/$/, "");

  // Project list
  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: { key: string; openCount: number; selected?: boolean }[] }>("/api/projects"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const projectOptions = useMemo(() => scopeProjectItems(projectsData?.items ?? []), [projectsData?.items]);

  // User preferences (to pre-select the active project)
  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    retry: 0,
  });

  // Auto-select the first preferred project (or the first available project)
  if (!filterProject && (prefs || projectOptions.length > 0)) {
    const pick = resolveInitialProject({
      urlProject: null,
      initialKeys: [],
      preferredProjects: prefs?.projects,
      availableProjects: prefs?.available,
      projectKeys: projectOptions.map((p) => p.key),
    });

    if (pick) {
      setFilterProject(pick);
    }
  }

  // Selection mode and task filters
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("pick");
  const [taskFilters, setTaskFilters] = useState<IssueFilters>(DEFAULT_BULK_FILTERS);

  // Tasks belonging ONLY to the selected project
  const projectIssues = useMemo(
    () => (filterProject ? issues.filter((issue) => issue.projectKey === filterProject) : []),
    [filterProject, issues]
  );
  const availableAssignees = useMemo(
    () => deriveAssigneeOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const labelOptions = useMemo(
    () => deriveLabelOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const priorityOptions = useMemo(
    () => derivePriorityOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const epicOptions = useMemo(
    () => deriveEpicOptions(filtersData, projectIssues, sessionUsername),
    [filtersData, projectIssues, sessionUsername]
  );

  // Selected task keys
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialKeys));
  const [prevInitialKeys, setPrevInitialKeys] = useState(initialKeys);
  if (initialKeys !== prevInitialKeys) {
    setPrevInitialKeys(initialKeys);
    if (initialKeys.length > 0) {
      setSelected(new Set(initialKeys));
      const proj = searchParams?.get("project")?.trim().toUpperCase() || initialKeys[0]?.split("-")[0];
      if (proj && proj !== filterProject) {
        setFilterProject(proj);
      }
    }
  }

  const [filterOnlySelected, setFilterOnlySelected] = useState(false);

  // Sorting option for tasks
  const [sortOption, setSortOption] = useState<SortOption>("default");

  // Guarantee placeholder for any initial keys if not already present in the loaded issues list
  const displayProjectIssues = useMemo(
    () => withPlaceholderIssues(initialKeys, filterProject, projectIssues),
    [filterProject, initialKeys, projectIssues]
  );

  const filteredIssues = useMemo(
    () =>
      filterAndSortIssues(displayProjectIssues, {
        filterProject,
        taskFilters,
        jiraUsername: sessionUsername,
        filterOnlySelected,
        selected,
        sortOption,
        initialKeyIndexMap,
      }),
    [
      filterProject,
      displayProjectIssues,
      taskFilters,
      sessionUsername,
      filterOnlySelected,
      sortOption,
      selected,
      initialKeyIndexMap,
    ]
  );

  const allSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selected.has(i.jiraKey));
  const effectiveCount = selectionMode === "filter" ? filteredIssues.length : selected.size;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allSelected) filteredIssues.forEach((issue) => next.delete(issue.jiraKey));
      else filteredIssues.forEach((issue) => next.add(issue.jiraKey));
      return next;
    });
  }

  function clearSelected() {
    setSelected(new Set());
  }

  // Reset when changing project
  function handleProjectChange(newProject: string) {
    setFilterProject(newProject);
    setSelected(new Set());
    setTaskFilters(DEFAULT_BULK_FILTERS);
    setFilterOnlySelected(false);
    setSortOption("default");
    onProjectChange?.();
  }

  return {
    filterProject,
    setFilterProject,
    handleProjectChange,
    projectOptions,
    projectIssues,
    issues,
    totalServerIssues,
    isIssuesLoading,
    isLoadingMore,
    handleLoadMore,
    filtersData,
    availableAssignees,
    labelOptions,
    priorityOptions,
    epicOptions,
    selectionMode,
    setSelectionMode,
    taskFilters,
    setTaskFilters,
    selected,
    setSelected,
    clearSelected,
    toggle,
    toggleAll,
    filterOnlySelected,
    setFilterOnlySelected,
    sortOption,
    setSortOption,
    displayProjectIssues,
    filteredIssues,
    allSelected,
    effectiveCount,
    initialKeys,
    initialKeysSet,
    jiraBaseUrl,
    returnTo,
  };
}
export type BulkSelectionController = ReturnType<typeof useBulkSelection>;
