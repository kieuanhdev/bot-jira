import type { IssueItem } from "@/hooks/use-issues";
import type { ProjectFieldOption } from "./bulk-types";
import { categoryOf } from "./bulk-utils";

/** Response of `/api/issues/filters` for a project. */
export interface BulkFiltersResponse {
  assignees: string[];
  statuses?: string[];
  labels: string[];
  priorities: string[];
  epics?: string[];
  types?: string[];
  fixVersions?: string[];
  reporters?: string[];
  approvers?: string[];
  testers?: string[];
  displayNames?: Record<string, string>;
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

export function deriveTypeOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.types && filtersData.types.length > 0) return filtersData.types;
  return Array.from(new Set(projectIssues.map((issue) => issue.type).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function deriveFixVersionOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.fixVersions && filtersData.fixVersions.length > 0) return filtersData.fixVersions;
  return Array.from(new Set(projectIssues.flatMap((issue) => issue.fixVersionNames))).sort((a, b) => a.localeCompare(b));
}

export function deriveReporterOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.reporters && filtersData.reporters.length > 0) return filtersData.reporters;
  return Array.from(new Set(projectIssues.map((issue) => issue.reporterJira).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));
}

export function deriveApproverOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.approvers && filtersData.approvers.length > 0) return filtersData.approvers;
  return Array.from(new Set(projectIssues.map((issue) => issue.approverJira).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));
}

export function deriveTesterOptions(
  filtersData: BulkFiltersResponse | undefined,
  projectIssues: IssueItem[]
): string[] {
  if (filtersData?.testers && filtersData.testers.length > 0) return filtersData.testers;
  return Array.from(new Set(projectIssues.map((issue) => issue.testerJira).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));
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
