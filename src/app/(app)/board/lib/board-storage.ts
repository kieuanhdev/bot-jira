import {
  DEFAULT_BOARD_FILTERS,
  normalizeIssueFilters,
  type IssueFilters,
} from "@/lib/issues/issue-filters";
import type { SortMode, ViewMode } from "./board-types";

export const BOARD_STORAGE_KEYS = {
  PROJECT: "jira_board_selected_project",
  FILTERS_PREFIX: "jira_board_filters_",
  SORT_MODE: "jira_board_sort_mode",
  VIEW_MODE: "jira_board_view_mode",
} as const;

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Loads the last selected project from localStorage.
 */
export function loadStoredProject(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOARD_STORAGE_KEYS.PROJECT);
    return raw ? raw.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Saves the last selected project to localStorage.
 */
export function saveStoredProject(projectKey: string): void {
  const storage = getStorage();
  if (!storage || !projectKey) return;
  try {
    storage.setItem(BOARD_STORAGE_KEYS.PROJECT, projectKey.trim().toUpperCase());
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Loads stored filters for a given project from localStorage.
 * Normalizes the filters safely using normalizeIssueFilters.
 */
export function loadStoredFilters(
  projectKey: string,
  myUsername?: string | null
): IssueFilters | null {
  const storage = getStorage();
  if (!storage || !projectKey) return null;
  try {
    const cleanKey = projectKey.trim().toUpperCase();
    const raw = storage.getItem(`${BOARD_STORAGE_KEYS.FILTERS_PREFIX}${cleanKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return normalizeIssueFilters(
      {
        project: cleanKey,
        query: typeof parsed.query === "string" ? parsed.query : "",
        assigneeScope: parsed.assigneeScope ?? DEFAULT_BOARD_FILTERS.assigneeScope,
        statuses: Array.isArray(parsed.statuses) ? parsed.statuses : [],
        labels: Array.isArray(parsed.labels) ? parsed.labels : [],
        priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
        includeDone:
          typeof parsed.includeDone === "boolean"
            ? parsed.includeDone
            : DEFAULT_BOARD_FILTERS.includeDone,
      },
      myUsername
    );
  } catch {
    return null;
  }
}

/**
 * Saves filters for a given project to localStorage.
 */
export function saveStoredFilters(projectKey: string, filters: IssueFilters): void {
  const storage = getStorage();
  if (!storage || !projectKey) return;
  try {
    const cleanKey = projectKey.trim().toUpperCase();
    const toSave: IssueFilters = {
      ...filters,
      project: cleanKey,
    };
    storage.setItem(
      `${BOARD_STORAGE_KEYS.FILTERS_PREFIX}${cleanKey}`,
      JSON.stringify(toSave)
    );
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Loads the saved sort mode from localStorage.
 */
export function loadStoredSortMode(): SortMode | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOARD_STORAGE_KEYS.SORT_MODE);
    if (raw === "priority" || raw === "updated" || raw === "age") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves sort mode to localStorage.
 */
export function saveStoredSortMode(mode: SortMode): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(BOARD_STORAGE_KEYS.SORT_MODE, mode);
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Loads the saved view mode ("board" | "list") from localStorage.
 */
export function loadStoredViewMode(): ViewMode | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOARD_STORAGE_KEYS.VIEW_MODE);
    if (raw === "board" || raw === "list") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves view mode to localStorage.
 */
export function saveStoredViewMode(mode: ViewMode): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(BOARD_STORAGE_KEYS.VIEW_MODE, mode);
  } catch {
    // Ignore storage quota or security errors
  }
}
