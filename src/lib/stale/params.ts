import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { StaleReason } from "./classify";
import type { StaleQueryParams } from "./types";

/**
 * Normalizes a query filter value.
 * `all` is the UI sentinel. Treat it as empty string so copied URLs
 * and older clients cannot accidentally hide data.
 */
export function normalizeFilterValue(value: string | null): string {
  const normalized = (value ?? "").trim();
  return normalized.toLowerCase() === "all" ? "" : normalized;
}

/**
 * Parse and normalize query parameters from an incoming request URL.
 */
export function parseStaleQueryParams(urlInput: string | URL): StaleQueryParams {
  const url = typeof urlInput === "string" ? new URL(urlInput, "http://localhost") : urlInput;

  const project = normalizeProjectKey(url.searchParams.get("project") ?? "");
  const projectListRaw = (url.searchParams.get("projectList") ?? "")
    .split(",")
    .map(normalizeProjectKey)
    .filter(Boolean);

  const assignee = normalizeFilterValue(url.searchParams.get("assignee"));
  const status = normalizeFilterValue(url.searchParams.get("status"));
  const reason = normalizeFilterValue(url.searchParams.get("reason")) as StaleReason | "";
  const severity = normalizeFilterValue(url.searchParams.get("severity"));

  return {
    project,
    projectList: projectListRaw,
    assignee,
    status,
    reason,
    severity,
  };
}

/**
 * Resolves the user's allowed projects based on board preferences
 * and active projects from catalog.
 */
export function resolveAllowedProjects(
  userBoardProjects: string[],
  activeCatalogProjects: { key: string }[],
): string[] {
  const activeCatalogKeys = new Set(activeCatalogProjects.map((p) => p.key));
  const filteredBoardProjects = userBoardProjects
    .map(normalizeProjectKey)
    .filter((k) => activeCatalogKeys.has(k));

  return filteredBoardProjects.length > 0
    ? filteredBoardProjects
    : activeCatalogProjects.map((p) => p.key);
}

/**
 * Resolves the actual project scope for the query based on parameters
 * and catalog availability.
 */
export function resolveScopedProjects(
  params: Pick<StaleQueryParams, "project" | "projectList">,
  allowedProjects: string[],
  activeCatalogKeys: Set<string>,
): string[] {
  if (params.project && activeCatalogKeys.has(params.project)) {
    return [params.project];
  }

  const validProjectList = params.projectList.filter((s) => activeCatalogKeys.has(s));
  if (validProjectList.length > 0) {
    return validProjectList;
  }

  return allowedProjects;
}

/**
 * Pure predicate checking whether an issue assignee matches the assignee filter.
 */
export function isAssigneeMatch(
  issueAssignee: string | null,
  filterAssignee: string,
  myUsername: string | null,
  myAliases: string[],
): boolean {
  if (!filterAssignee) return true;

  const filterLower = filterAssignee.toLowerCase();
  if (filterLower === "me") {
    if (!myUsername) return true;
    const lower = (issueAssignee ?? "").toLowerCase();
    return myAliases.some((a) => a.toLowerCase() === lower);
  }

  if (filterLower === "unassigned") {
    return !issueAssignee;
  }

  return issueAssignee === filterAssignee;
}
