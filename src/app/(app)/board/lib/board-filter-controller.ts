"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { BoardFilters } from "@/hooks/use-issues";
import {
  DEFAULT_BOARD_FILTERS,
  effectiveAssignees,
  parseIssueFilters,
  serializeIssueFilters,
  type IssueFilters,
} from "@/lib/issues/issue-filters";
import {
  loadStoredFilters,
  loadStoredProject,
  loadStoredTeamMode,
  saveStoredFilters,
  saveStoredProject,
  saveStoredTeamMode,
} from "./board-storage";

export type BoardQuickFilter =
  | ""
  | "overdue"
  | "unassigned"
  | "unestimated"
  | "stale"
  | "missingApprover"
  | "missingTester";

export function hasBoardFilterParams(searchParams: Pick<URLSearchParams, "keys"> | null): boolean {
  return Boolean(
    searchParams && Array.from(searchParams.keys()).some((key) => key !== "project")
  );
}

export function createBoardIssueFilters({
  filters,
  selectedProject,
  debouncedQuery,
  quickFilter,
}: {
  filters: IssueFilters;
  selectedProject: string;
  debouncedQuery: string;
  quickFilter: BoardQuickFilter;
}): BoardFilters {
  const activeAssignees = effectiveAssignees(filters.assigneeScope);
  const assigneeAll = activeAssignees === "ALL";

  return {
    ...(selectedProject ? { project: selectedProject } : {}),
    q: debouncedQuery || undefined,
    label: filters.labels.length > 0 ? filters.labels : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    status: filters.statuses.length > 0 ? filters.statuses : undefined,
    epic: filters.epics.length > 0 ? filters.epics : undefined,
    reporter: filters.reporters.length > 0 ? filters.reporters : undefined,
    approver:
      quickFilter === "missingApprover"
        ? "unassigned"
        : filters.approvers.length > 0
          ? filters.approvers
          : undefined,
    tester:
      quickFilter === "missingTester"
        ? "unassigned"
        : filters.testers.length > 0
          ? filters.testers
          : undefined,
    role: filters.roles.length > 0 ? filters.roles : undefined,
    type: filters.types.length > 0 ? filters.types : undefined,
    fixVersion: filters.fixVersions.length > 0 ? filters.fixVersions : undefined,
    overdue: filters.overdue || quickFilter === "overdue" || undefined,
    unestimated: quickFilter === "unestimated" || undefined,
    staleDays: quickFilter === "stale" ? 7 : undefined,
    assignee:
      quickFilter === "unassigned"
        ? "unassigned"
        : assigneeAll || filters.roles.length > 0
          ? "ALL"
          : activeAssignees,
    includeDone: true,
    limit: 1000,
  };
}

export function createBoardFilterSignature({
  filters,
  selectedProject,
  debouncedQuery,
  quickFilter,
}: {
  filters: IssueFilters;
  selectedProject: string;
  debouncedQuery: string;
  quickFilter: BoardQuickFilter;
}): string {
  const activeAssignees = effectiveAssignees(filters.assigneeScope);
  return JSON.stringify({
    p: selectedProject,
    q: debouncedQuery,
    label: [...filters.labels].sort(),
    priority: [...filters.priorities].sort(),
    status: [...filters.statuses].sort(),
    epic: [...filters.epics].sort(),
    reporter: [...filters.reporters].sort(),
    approver: [...filters.approvers].sort(),
    tester: [...filters.testers].sort(),
    role: [...filters.roles].sort(),
    type: [...filters.types].sort(),
    fixVersion: [...filters.fixVersions].sort(),
    overdue: filters.overdue,
    quickFilter,
    assignee: activeAssignees === "ALL" ? "ALL" : [...activeAssignees].sort(),
  });
}

export function createBoardFilterQuery(filters: IssueFilters, selectedProject: string): string {
  const params = serializeIssueFilters(
    { ...filters, project: selectedProject },
    DEFAULT_BOARD_FILTERS
  );
  if (selectedProject) params.set("project", selectedProject);
  return params.toString();
}

export interface LoadInitialBoardFiltersOptions {
  searchParams?: URLSearchParams | ReadonlyURLSearchParams | null;
  selectedProject: string;
  myName: string | null;
  canUseTeamMode: boolean;
}

export interface InitialBoardFilters {
  filters: IssueFilters;
  teamMode: boolean;
}

export function loadInitialBoardFilters({
  searchParams,
  selectedProject,
  myName,
  canUseTeamMode,
}: LoadInitialBoardFiltersOptions): InitialBoardFilters {
  const urlProject = searchParams?.get("project")?.trim().toUpperCase();
  const searchParamsBelongToProject =
    !urlProject || !selectedProject || urlProject === selectedProject.toUpperCase();
  const activeSearchParams = searchParamsBelongToProject ? searchParams : null;

  const hasFilterParamsInUrl = hasBoardFilterParams(activeSearchParams ?? null);
  const storedTeamMode = Boolean(
    selectedProject && canUseTeamMode && loadStoredTeamMode(selectedProject)
  );

  if (activeSearchParams && hasFilterParamsInUrl) {
    const parsed = parseIssueFilters(activeSearchParams, DEFAULT_BOARD_FILTERS, myName);
    const teamMode = Boolean(
      canUseTeamMode &&
      (parsed.assigneeScope.mode === "all" || storedTeamMode)
    );
    return {
      filters: {
        ...parsed,
        project: selectedProject || parsed.project,
      },
      teamMode,
    };
  }

  const storedFilters = selectedProject ? loadStoredFilters(selectedProject, myName) : null;
  let baseFilters: IssueFilters = storedFilters ?? {
    ...DEFAULT_BOARD_FILTERS,
    ...(selectedProject ? { project: selectedProject } : {}),
  };

  if (storedTeamMode) {
    const { mode, roster } = baseFilters.assigneeScope;
    const onlyMe = mode === "roster" && roster.length === 1 && roster[0] === "me";
    if (onlyMe || mode === "all") {
      baseFilters = {
        ...baseFilters,
        assigneeScope: { mode: "all", roster: [], view: "all-selected" },
      };
    }
  } else if (baseFilters.assigneeScope.mode === "all") {
    baseFilters = {
      ...baseFilters,
      assigneeScope: { mode: "roster", roster: ["me"], view: "all-selected" },
    };
  }

  return {
    filters: baseFilters,
    teamMode: storedTeamMode,
  };
}

interface BoardFilterControllerOptions {
  searchParams: ReadonlyURLSearchParams | null;
  selectedProject: string;
  myName: string | null;
  canUseTeamMode: boolean;
  /** False while `selectedProject` is a fallback rather than the user's pick. */
  persistProject?: boolean;
  replaceUrl: (url: string) => void;
}

export function useBoardFilterController({
  searchParams,
  selectedProject,
  myName,
  canUseTeamMode,
  persistProject = true,
  replaceUrl,
}: BoardFilterControllerOptions) {
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";
  const initialProject = urlProject || selectedProject || loadStoredProject() || "";
  const initialSettings = loadInitialBoardFilters({
    searchParams,
    selectedProject: initialProject,
    myName,
    canUseTeamMode,
  });

  const [filters, setFilters] = useState<IssueFilters>(() => initialSettings.filters);
  const [quickFilter, setQuickFilter] = useState<BoardQuickFilter>("");
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  const [teamModeState, setTeamModeState] = useState({
    project: initialProject,
    enabled: initialSettings.teamMode,
  });

  const teamMode =
    canUseTeamMode &&
    (teamModeState.project === selectedProject
      ? teamModeState.enabled
      : loadStoredTeamMode(selectedProject));

  function changeTeamMode(enabled: boolean) {
    const next = canUseTeamMode && enabled;
    setTeamModeState({ project: selectedProject, enabled: next });
    saveStoredTeamMode(selectedProject, next);
    setFilters((current) => ({
      ...current,
      assigneeScope: next
        ? { mode: "all", roster: [], view: "all-selected" }
        : { mode: "roster", roster: ["me"], view: "all-selected" },
    }));
  }

  function selectProject(nextProject: string, previousProject: string) {
    if (previousProject) saveStoredFilters(previousProject, filters);
    saveStoredProject(nextProject);
    const nextInit = loadInitialBoardFilters({
      searchParams: null,
      selectedProject: nextProject,
      myName,
      canUseTeamMode,
    });
    setPrevProject(nextProject);
    setTeamModeState({ project: nextProject, enabled: nextInit.teamMode });
    setFilters(nextInit.filters);
  }

  useEffect(() => {
    if (selectedProject && persistProject) saveStoredProject(selectedProject);
  }, [selectedProject, persistProject]);

  const [prevProject, setPrevProject] = useState(initialProject);
  if (selectedProject && selectedProject !== prevProject) {
    setPrevProject(selectedProject);
    const isUrlForProject =
      searchParams?.get("project")?.trim().toUpperCase() === selectedProject.toUpperCase();
    const nextInit = loadInitialBoardFilters({
      searchParams: isUrlForProject ? searchParams : null,
      selectedProject,
      myName,
      canUseTeamMode,
    });
    setTeamModeState({ project: selectedProject, enabled: nextInit.teamMode });
    setFilters(nextInit.filters);
  }

  useEffect(() => {
    if (selectedProject) saveStoredFilters(selectedProject, filters);
  }, [filters, selectedProject]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const query = createBoardFilterQuery(filters, selectedProject);
      const currentUrl = window.location.pathname + (window.location.search || "");
      const targetUrl = window.location.pathname + (query ? `?${query}` : "");
      if (currentUrl !== targetUrl) replaceUrl(targetUrl);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, selectedProject, replaceUrl]);

  useEffect(() => {
    if (filters.query === debouncedQuery) return;
    const timer = setTimeout(() => setDebouncedQuery(filters.query), 300);
    return () => clearTimeout(timer);
  }, [filters.query, debouncedQuery]);

  const filtersReady = Boolean(selectedProject);
  const model = { filters, selectedProject, debouncedQuery, quickFilter };
  return {
    filters,
    setFilters,
    quickFilter,
    setQuickFilter,
    boardFilters: createBoardIssueFilters(model),
    filterSignature: createBoardFilterSignature(model),
    teamMode,
    changeTeamMode,
    selectProject,
    urlProject,
    filtersReady,
  };
}
