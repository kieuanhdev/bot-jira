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

interface BoardFilterControllerOptions {
  searchParams: ReadonlyURLSearchParams | null;
  selectedProject: string;
  myName: string | null;
  canUseTeamMode: boolean;
  replaceUrl: (url: string) => void;
}

export function useBoardFilterController({
  searchParams,
  selectedProject,
  myName,
  canUseTeamMode,
  replaceUrl,
}: BoardFilterControllerOptions) {
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";
  const hasFilterParamsInUrl = hasBoardFilterParams(searchParams);
  const [filters, setFilters] = useState<IssueFilters>(() => {
    if (searchParams && hasFilterParamsInUrl) {
      return parseIssueFilters(searchParams, DEFAULT_BOARD_FILTERS, myName);
    }
    const initialProject = urlProject || loadStoredProject() || "";
    return (initialProject && loadStoredFilters(initialProject, myName)) || DEFAULT_BOARD_FILTERS;
  });
  const [quickFilter, setQuickFilter] = useState<BoardQuickFilter>("");
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  const [teamModeState, setTeamModeState] = useState({ project: "", enabled: false });

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
    setFilters(
      loadStoredFilters(nextProject, myName) ?? {
        ...DEFAULT_BOARD_FILTERS,
        project: nextProject,
      }
    );
  }

  useEffect(() => {
    if (selectedProject) saveStoredProject(selectedProject);
  }, [selectedProject]);

  const teamScopeAppliedRef = useRef("");
  useEffect(() => {
    if (!teamMode || !selectedProject || teamScopeAppliedRef.current === selectedProject) return;
    teamScopeAppliedRef.current = selectedProject;
    setFilters((current) => {
      const { mode, roster } = current.assigneeScope;
      const onlyMe = mode === "roster" && roster.length === 1 && roster[0] === "me";
      return onlyMe
        ? { ...current, assigneeScope: { mode: "all", roster: [], view: "all-selected" } }
        : current;
    });
  }, [teamMode, selectedProject]);

  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (!initialSyncDoneRef.current && selectedProject && !hasFilterParamsInUrl) {
      initialSyncDoneRef.current = true;
      const saved = loadStoredFilters(selectedProject, myName);
      if (saved) queueMicrotask(() => setFilters(saved));
    }
  }, [selectedProject, myName, hasFilterParamsInUrl]);

  const myNameSyncedRef = useRef(false);
  useEffect(() => {
    if (!myName || myNameSyncedRef.current) return;
    myNameSyncedRef.current = true;
    setFilters((previous) => {
      if (hasFilterParamsInUrl && searchParams) {
        return parseIssueFilters(searchParams, previous, myName);
      }
      return (selectedProject && loadStoredFilters(selectedProject, myName)) || previous;
    });
  }, [myName, searchParams, hasFilterParamsInUrl, selectedProject]);

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
  };
}
