import type { IssueItem } from "@/hooks/use-issues";
import {
  type IssueFilters,
  effectiveAssignees,
} from "@/lib/issues/issue-filters";
import type {
  BulkAction,
  BulkFieldValues,
  Preview,
  PreviewBucket,
  ProjectFieldOption,
} from "./bulk-types";
import { categoryOf, previewBucket } from "./bulk-utils";

export type OperationKind = "update-fields" | "transition" | "log-work";
export type SelectionMode = "pick" | "filter";
export type SortOption =
  | "default"
  | "name-asc"
  | "name-desc"
  | "created-desc"
  | "created-asc"
  | "updated-desc";

/** Response of `/api/issues/filters` for a project. */
export interface BulkFiltersResponse {
  assignees: string[];
  statuses?: string[];
  labels: string[];
  priorities: string[];
  epics?: string[];
}

export interface ProjectStatus {
  name: string;
  category: string;
}

export function deriveAssigneeOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.assignees && filtersData.assignees.length > 0) return filtersData.assignees;
  return Array.from(new Set(projectIssues.map((issue) => issue.assigneeJira).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

export function deriveLabelOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.labels && filtersData.labels.length > 0) return filtersData.labels;
  return Array.from(new Set(projectIssues.flatMap((issue) => issue.labels))).sort((a, b) => a.localeCompare(b));
}

export function derivePriorityOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.priorities && filtersData.priorities.length > 0) return filtersData.priorities;
  const values = Array.from(new Set(projectIssues.map((issue) => issue.priority).filter(Boolean)));
  return (values.length > 0 ? values : ["Low", "Medium", "High", "Highest", "Blocker"]).sort((a, b) => a.localeCompare(b));
}

/** Epic dropdown options: "no epic", then every epic (marking the user's own). */
export function deriveEpicOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[],
  jiraUsername: string | null | undefined
): { value: string; label: string }[] {
  const set = new Set<string>();
  if (filtersData?.epics && filtersData.epics.length > 0) {
    for (const e of filtersData.epics) {
      if (e) set.add(e);
    }
  }
  for (const issue of projectIssues) {
    if (issue.epic) set.add(issue.epic);
  }
  const myUsername = jiraUsername?.toLowerCase();
  const sortedEpics = Array.from(set).sort((a, b) => a.localeCompare(b));

  const myEpics = new Set<string>();
  if (myUsername) {
    for (const issue of projectIssues) {
      if (issue.epic && issue.assigneeJira?.toLowerCase() === myUsername) {
        myEpics.add(issue.epic);
      }
    }
  }

  const hasNoEpic = projectIssues.some((issue) => !issue.epic);
  const options: { value: string; label: string }[] = [];

  if (hasNoEpic) {
    options.push({ value: "none", label: "Không có Epic" });
  }

  for (const ep of sortedEpics) {
    const isMine = myEpics.has(ep);
    options.push({
      value: ep,
      label: isMine ? `${ep} (Của tôi)` : ep,
    });
  }

  return options;
}

/** Every status known for the project (board config, filter options, issues), sorted by name. */
export function deriveProjectStatuses(
  boardItems: { name: string; category: string }[] | undefined,
  filterStatuses: string[] | undefined,
  projectIssues: IssueItem[]
): ProjectStatus[] {
  const map = new Map<string, string>();
  boardItems?.forEach((s) => {
    if (s.name) map.set(s.name, s.category || "indeterminate");
  });
  filterStatuses?.forEach((s) => {
    if (s && !map.has(s)) map.set(s, "indeterminate");
  });
  projectIssues.forEach((issue) => {
    if (issue.status && !map.has(issue.status)) {
      map.set(issue.status, categoryOf(issue.status, issue.statusCategory));
    }
  });
  const list = Array.from(map.entries())
    .map(([name, category]) => ({ name, category }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (list.length === 0) {
    return [
      { name: "To Do", category: "new" },
      { name: "In Progress", category: "indeterminate" },
      { name: "Done", category: "done" },
    ];
  }
  return list;
}

export function deriveStatusOptions(
  allProjectStatuses: ProjectStatus[],
  filterStatuses: string[] | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (allProjectStatuses.length > 0) return allProjectStatuses.map((s) => s.name);
  if (filterStatuses && filterStatuses.length > 0) return filterStatuses;
  return Array.from(new Set(projectIssues.map((issue) => issue.status).filter(Boolean))).sort();
}

/** Placeholders for keys passed in the URL that are not in the loaded issue list yet, placed first. */
export function withPlaceholderIssues(
  initialKeys: string[],
  filterProject: string,
  projectIssues: IssueItem[]
): IssueItem[] {
  if (!filterProject) return [];
  const existing = new Set(projectIssues.map((i) => i.jiraKey));
  const placeholders: IssueItem[] = initialKeys
    .filter((k) => !existing.has(k) && k.startsWith(filterProject + "-"))
    .map((k) => ({
      jiraKey: k,
      projectKey: filterProject,
      summary: `Task ${k} (Đang chuẩn hóa)`,
      description: "",
      status: "To Do",
      statusCategory: "To Do",
      statusChangedAt: null,
      assigneeJira: null,
      reporterJira: null,
      approverJira: null,
      testerJira: null,
      labels: [],
      fixVersionIds: [],
      fixVersionNames: [],
      priority: "Medium",
      points: null,
      type: "Task",
      dueDate: null,
      timeSpent: null,
      originalEstimateSeconds: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      aiScore: null,
      aiDecision: null,
    }));
  return [...placeholders, ...projectIssues];
}

interface FilterAndSortParams {
  filterProject: string;
  taskFilters: IssueFilters;
  jiraUsername: string | null | undefined;
  filterOnlySelected: boolean;
  selected: Set<string>;
  sortOption: SortOption;
  initialKeyIndexMap: Map<string, number>;
}

/** Apply the task filters, "only selected" toggle and sort order to the project's issues. */
export function filterAndSortIssues(
  displayProjectIssues: IssueItem[],
  { filterProject, taskFilters, jiraUsername, filterOnlySelected, selected, sortOption, initialKeyIndexMap }: FilterAndSortParams
): IssueItem[] {
  if (!filterProject) return [];
  const query = (taskFilters.query || "").trim().toLowerCase();
  const myUsername = jiraUsername?.toLowerCase();
  const activeAssignees = effectiveAssignees(taskFilters.assigneeScope);
  const isAllAssignees = activeAssignees === "ALL";
  const assigneeList: string[] = isAllAssignees ? [] : activeAssignees;

  let list = displayProjectIssues
    .filter((issue) => {
      if (taskFilters.statuses.length === 0) return true;
      return taskFilters.statuses.includes(issue.status);
    })
    .filter((issue) => {
      if (taskFilters.labels.length === 0) return true;
      return taskFilters.labels.some((l) => issue.labels.includes(l));
    })
    .filter((issue) => {
      if (taskFilters.priorities.length === 0) return true;
      return taskFilters.priorities.includes(issue.priority);
    })
    .filter((issue) => {
      if (!taskFilters.epics || taskFilters.epics.length === 0) return true;
      const issueEpic = (issue.epic ?? "").toLowerCase();
      const hasNone = taskFilters.epics.some(
        (e) => e.toLowerCase() === "none" || e.toLowerCase() === "unassigned"
      );
      if (!issue.epic) return hasNone;
      return taskFilters.epics.some(
        (e) => e.toLowerCase() !== "none" && e.toLowerCase() !== "unassigned" && e.toLowerCase() === issueEpic
      );
    })
    .filter((issue) => {
      if (isAllAssignees) return true;
      const hasUnassigned = assigneeList.some(
        (a) => a.toLowerCase() === "unassigned" || a.toLowerCase() === "none"
      );
      const named = assigneeList.filter(
        (a) => a.toLowerCase() !== "unassigned" && a.toLowerCase() !== "none"
      );
      const issueAssignee = (issue.assigneeJira ?? "").toLowerCase();
      if (!issue.assigneeJira) return hasUnassigned;
      return named.some((token) => {
        const t = token.toLowerCase();
        if (t === "me") {
          if (!myUsername) return true;
          return issueAssignee === myUsername || issueAssignee === myUsername.replace(/_mb$/, "") || `${issueAssignee}_mb` === myUsername;
        }
        return issueAssignee === t;
      });
    })
    .filter((issue) =>
      query ? issue.jiraKey.toLowerCase().includes(query) || issue.summary.toLowerCase().includes(query) : true
    );

  if (filterOnlySelected) {
    list = list.filter((issue) => selected.has(issue.jiraKey));
  }

  // Apply sorting
  if (sortOption === "name-asc") {
    list = [...list].sort((a, b) => (a.summary || "").localeCompare(b.summary || ""));
  } else if (sortOption === "name-desc") {
    list = [...list].sort((a, b) => (b.summary || "").localeCompare(a.summary || ""));
  } else if (sortOption === "created-desc") {
    list = [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (sortOption === "created-asc") {
    list = [...list].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  } else if (sortOption === "updated-desc") {
    list = [...list].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  } else if (initialKeyIndexMap.size > 0) {
    // Prioritize tasks being standardized (from initialKeys) to the top in their specified order
    list = [...list].sort((a, b) => {
      const aIndex = initialKeyIndexMap.get(a.jiraKey);
      const bIndex = initialKeyIndexMap.get(b.jiraKey);
      if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return 0;
    });
  }

  return list;
}

export function isValidEstimate(estimate: string): boolean {
  return !estimate.trim() || /^(?=.*\d)(?:\d+[wdhm]\s*)+$/i.test(estimate.trim());
}

export interface BulkActionInput {
  filterProject: string;
  operationKind: OperationKind;
  targetStatus: string;
  worklogDuration: string;
  isWorklogDurationValid: boolean;
  worklogStarted: string;
  worklogComment: string;
  enabledFields: Set<string>;
  clearAssignee: boolean;
  assignee: string;
  clearLabels: boolean;
  label: string;
  priority: string;
  issueType: string;
  clearPoints: boolean;
  points: string;
  availableFieldMap: Map<string, ProjectFieldOption>;
  estimate: string;
  isEstimateValid: boolean;
  clearDueDate: boolean;
  dueDate: string;
  clearFixVersions: boolean;
  fixVersions: string[];
  clearEpic: boolean;
  epic: string;
}

/** The bulk action described by the form, or null while the form is incomplete or invalid. */
export function buildBulkAction({
  filterProject,
  operationKind,
  targetStatus,
  worklogDuration,
  isWorklogDurationValid,
  worklogStarted,
  worklogComment,
  enabledFields,
  clearAssignee,
  assignee,
  clearLabels,
  label,
  priority,
  issueType,
  clearPoints,
  points,
  availableFieldMap,
  estimate,
  isEstimateValid,
  clearDueDate,
  dueDate,
  clearFixVersions,
  fixVersions,
  clearEpic,
  epic,
}: BulkActionInput): BulkAction | null {
  if (!filterProject) return null;

  if (operationKind === "transition") {
    if (!targetStatus.trim()) return null;
    return {
      kind: "transition",
      value: targetStatus.trim(),
    };
  }

  if (operationKind === "log-work") {
    if (!worklogDuration.trim() || !isWorklogDurationValid) return null;
    return {
      kind: "log-work",
      value: {
        timeSpent: worklogDuration.trim(),
        ...(worklogStarted ? { started: worklogStarted } : {}),
        ...(worklogComment.trim() ? { comment: worklogComment.trim() } : {}),
      },
    };
  }

  const value: BulkFieldValues = {};

  if (enabledFields.has("assignee")) {
    if (!clearAssignee && !assignee.trim()) return null;
    value.assignee = clearAssignee ? null : assignee.trim();
  }
  if (enabledFields.has("labels")) {
    if (clearLabels) {
      value.labels = [];
    } else {
      const parsed = label.split(",").map((item) => item.trim()).filter(Boolean);
      value.labels = parsed;
    }
  }
  if (enabledFields.has("priority")) {
    if (!priority) return null;
    value.priority = priority;
  }
  if (enabledFields.has("issueType")) {
    if (!issueType) return null;
    value.issueType = issueType;
  }
  if (enabledFields.has("points")) {
    if (clearPoints) {
      value.points = null;
    } else {
      if (!points) return null;
      value.points = Number(points);
    }
  }
  if (enabledFields.has("estimate") && availableFieldMap.get("estimate")?.available !== false) {
    if (!estimate.trim() || !isEstimateValid) return null;
    value.estimate = estimate.trim();
  }
  if (enabledFields.has("dueDate")) {
    if (!clearDueDate && !dueDate) return null;
    value.dueDate = clearDueDate ? null : dueDate;
  }
  if (enabledFields.has("fixVersions")) {
    if (clearFixVersions) {
      value.fixVersions = [];
    } else {
      value.fixVersions = fixVersions;
    }
  }
  if (enabledFields.has("epic")) {
    if (clearEpic) {
      value.epic = null;
    } else {
      if (!epic.trim()) return null;
      value.epic = epic.trim().toUpperCase();
    }
  }

  return Object.keys(value).length > 0 ? { kind: "update-fields", value } : null;
}

interface PreviewRequestParams {
  selectionMode: SelectionMode;
  filterProject: string;
  taskFilters: IssueFilters;
  selected: Set<string>;
  action: BulkAction;
}

/** Body of the `POST /api/issues/bulk` preview request. */
export function buildPreviewRequestBody({
  selectionMode,
  filterProject,
  taskFilters,
  selected,
  action,
}: PreviewRequestParams) {
  const activeAssignees = effectiveAssignees(taskFilters.assigneeScope);
  const isAllAssignees = activeAssignees === "ALL";
  const body =
    selectionMode === "filter"
      ? {
          selector: {
            mode: "filter",
            project: filterProject,
            filters: {
              q: taskFilters.query || undefined,
              assignees: isAllAssignees ? "ALL" : activeAssignees,
              statuses: taskFilters.statuses.length > 0 ? taskFilters.statuses : undefined,
              labels: taskFilters.labels.length > 0 ? taskFilters.labels : undefined,
              priorities: taskFilters.priorities.length > 0 ? taskFilters.priorities : undefined,
              epics: taskFilters.epics && taskFilters.epics.length > 0 ? taskFilters.epics : undefined,
            },
          },
          action,
        }
      : {
          selector: {
            mode: "keys",
            keys: Array.from(selected),
          },
          action,
        };
  return body;
}

export function countPreviewBuckets(preview: Preview | null): Record<PreviewBucket, number> {
  return preview?.items.reduce<Record<PreviewBucket, number>>(
    (counts, item) => {
      counts[previewBucket(item)] += 1;
      return counts;
    },
    { changes: 0, unchanged: 0, warnings: 0, blocked: 0 }
  ) ?? { changes: 0, unchanged: 0, warnings: 0, blocked: 0 };
}

export function getConfirmLabel({
  preview,
  isLogWorkOp,
  isTransitionOp,
  targetStatus,
}: {
  preview: Preview | null;
  isLogWorkOp: boolean;
  isTransitionOp: boolean;
  targetStatus: string;
}): string {
  return preview
    ? isLogWorkOp
      ? `Ghi worklog ${preview.actionable} task`
      : isTransitionOp
        ? `Chuyển trạng thái ${preview.actionable} task sang "${targetStatus || (preview.items[0]?.after?.status as string) || ""}"`
        : `Cập nhật ${preview.actionable} task`
    : "Xác nhận thay đổi";
}

export function computePreviewBasis({
  action,
  selectionMode,
  filterProject,
  taskFilters,
  selected,
}: {
  action: BulkAction | null;
  selectionMode: SelectionMode;
  filterProject: string;
  taskFilters: IssueFilters;
  selected: Set<string>;
}): string {
  if (selectionMode === "filter") {
    return JSON.stringify({
      action,
      mode: "filter",
      project: filterProject,
      filters: taskFilters,
    });
  }
  return JSON.stringify({
    action,
    mode: "keys",
    keys: Array.from(selected).sort(),
  });
}

export function pruneUnavailableFields(
  enabledFields: Set<string>,
  fields: ProjectFieldOption[] | undefined
): { prunedFields: Set<string>; hasPrunedEstimate: boolean; hasPrunedPoints: boolean } {
  if (!fields) return { prunedFields: enabledFields, hasPrunedEstimate: false, hasPrunedPoints: false };
  const unavailableIds = new Set(
    fields.filter((f) => !f.available).map((f) => String(f.id))
  );
  if (unavailableIds.size === 0) {
    return { prunedFields: enabledFields, hasPrunedEstimate: false, hasPrunedPoints: false };
  }
  let changed = false;
  const next = new Set<string>();
  for (const id of enabledFields) {
    if (unavailableIds.has(id)) {
      changed = true;
    } else {
      next.add(id);
    }
  }
  return {
    prunedFields: changed ? next : enabledFields,
    hasPrunedEstimate: unavailableIds.has("estimate"),
    hasPrunedPoints: unavailableIds.has("points"),
  };
}

export function resolveInitialProject({
  urlProject,
  initialKeys = [],
  preferredProjects = [],
  availableProjects = [],
  projectKeys = [],
}: {
  urlProject?: string | null;
  initialKeys?: string[];
  preferredProjects?: string[];
  availableProjects?: string[];
  projectKeys?: string[];
}): string {
  if (urlProject && urlProject.trim()) return urlProject.trim().toUpperCase();
  if (initialKeys.length > 0) {
    const fromKey = initialKeys[0].split("-")[0];
    if (fromKey) return fromKey.toUpperCase();
  }
  const pick =
    preferredProjects.find((k) => projectKeys.includes(k)) ??
    availableProjects.find((k) => projectKeys.includes(k)) ??
    projectKeys[0] ??
    "";
  return pick;
}

