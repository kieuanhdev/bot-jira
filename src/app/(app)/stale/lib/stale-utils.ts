import { REQUIREMENT_BULK_FIELDS, type RequirementCode } from "@/lib/issues/standardization";
import { ALL, type Task, type SortMode, type FocusMode, type StandardizationTask } from "./stale-types";

export type StdMissingFilter = "ALL" | RequirementCode;
export type StdStaleFilter = "ALL" | "stale" | "healthy";
export type StdSortMode = "missing-desc" | "stateAge-desc" | "updated-desc" | "key-asc";

export interface StdFilters {
  missing: StdMissingFilter;
  project: string;
  status: string;
  stale: StdStaleFilter;
  search: string;
  sort: StdSortMode;
}

export function priorityScore(task: Task) {
  const severity = task.severity === "high" ? 3 : task.severity === "warning" ? 2 : 1;
  const blocked = task.staleReason === "blocked" || task.blockedDays > 0 ? 30_000 : 0;
  const unassigned = !task.assigneeJira ? 20_000 : 0;
  return (
    severity * 100_000 +
    (task.overdueDays > 0 ? 50_000 + task.overdueDays * 100 : 0) +
    blocked +
    unassigned +
    task.overByDays
  );
}

export function sortTasks(tasks: Task[], mode: SortMode) {
  return [...tasks].sort((a, b) => {
    if (mode === "stateAge") return b.stateAgeDays - a.stateAgeDays;
    if (mode === "overdue") return b.overdueDays - a.overdueDays || b.overByDays - a.overByDays;
    if (mode === "overBy") return b.overByDays - a.overByDays;
    return priorityScore(b) - priorityScore(a);
  });
}

export function matchesFocus(task: Task, focus: FocusMode) {
  if (focus === "high") return task.severity === "high";
  if (focus === "blocked") return task.staleReason === "blocked" || task.blockedDays > 0;
  if (focus === "overdue") return task.overdueDays > 0;
  if (focus === "unassigned") return !task.assigneeJira;
  return true;
}

export { formatTimeSpent } from "@/lib/format/time";

export function formatDueDate(value: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface ProjectEstimationUsage {
  hasEst: boolean;
  hasPts: boolean;
}

export function buildProjectEstimationUsage(
  allStdTasks: StandardizationTask[]
): Map<string, ProjectEstimationUsage> {
  const map = new Map<string, ProjectEstimationUsage>();
  for (const t of allStdTasks) {
    let usage = map.get(t.projectKey);
    if (!usage) {
      usage = { hasEst: false, hasPts: false };
      map.set(t.projectKey, usage);
    }
    if (!usage.hasEst && t.originalEstimateSeconds != null && t.originalEstimateSeconds > 0) {
      usage.hasEst = true;
    }
    if (!usage.hasPts && t.points != null && t.points > 0) {
      usage.hasPts = true;
    }
  }
  return map;
}

export function getEstimationMissingLabel(
  task: StandardizationTask,
  allTasksOrMap: StandardizationTask[] | Map<string, ProjectEstimationUsage>
): string {
  let usage: ProjectEstimationUsage | undefined;
  if (allTasksOrMap instanceof Map) {
    usage = allTasksOrMap.get(task.projectKey);
  } else {
    const projectTasks = allTasksOrMap.filter((t) => t.projectKey === task.projectKey);
    usage = {
      hasEst: projectTasks.some((t) => t.originalEstimateSeconds != null && t.originalEstimateSeconds > 0),
      hasPts: projectTasks.some((t) => t.points != null && t.points > 0),
    };
  }

  const hasEst = usage?.hasEst ?? false;
  const hasPts = usage?.hasPts ?? false;

  if (hasPts && !hasEst) return "Thiếu Points";
  if (hasEst && !hasPts) return "Thiếu Estimate";
  return "Thiếu Points/Est";
}

export function buildMissingBulkFields(
  keys: Set<string>,
  tasks: StandardizationTask[],
  usageMap?: Map<string, ProjectEstimationUsage>
): string {
  const fields = new Set<string>();
  const selectedTasks = tasks.filter((t) => keys.has(t.jiraKey));
  const relevantTasks = selectedTasks.length > 0 ? selectedTasks : tasks;

  const relevantProjects = new Set(relevantTasks.map((t) => t.projectKey));

  let hasEstimateUsage = false;
  let hasPointsUsage = false;

  if (usageMap) {
    for (const p of relevantProjects) {
      const u = usageMap.get(p);
      if (u?.hasEst) hasEstimateUsage = true;
      if (u?.hasPts) hasPointsUsage = true;
    }
  } else {
    const projectTasks = tasks.filter((t) => relevantProjects.has(t.projectKey));
    hasEstimateUsage = projectTasks.some(
      (t) => t.originalEstimateSeconds != null && t.originalEstimateSeconds > 0
    );
    hasPointsUsage = projectTasks.some((t) => t.points != null && t.points > 0);
  }

  for (const task of relevantTasks) {
    for (const req of task.missing) {
      if (req === "WORKLOG") continue;
      if (req === "ESTIMATION") {
        if (hasEstimateUsage && !hasPointsUsage) {
          fields.add("estimate");
        } else if (hasPointsUsage && !hasEstimateUsage) {
          fields.add("points");
        } else {
          fields.add("points");
          if (hasEstimateUsage) {
            fields.add("estimate");
          }
        }
      } else {
        const bulkFields = REQUIREMENT_BULK_FIELDS[req] ?? [];
        for (const bf of bulkFields) fields.add(bf);
      }
    }
  }

  if (fields.size > 0) {
    return Array.from(fields).join(",");
  }

  if (hasEstimateUsage && !hasPointsUsage) {
    return "estimate,fixVersions,dueDate";
  }
  return "points,fixVersions,dueDate";
}

/** Tasks matching the focus lens and the free-text query (case-insensitive, vi locale). */
export function filterFocusedTasks(tasks: Task[], focus: FocusMode, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  return tasks.filter(
    (task) =>
      matchesFocus(task, focus) &&
      (!normalizedQuery ||
        [task.jiraKey, task.summary, task.status, task.assigneeJira ?? "", task.staleReasonLabel, task.projectKey].some(
          (value) => value.toLocaleLowerCase("vi").includes(normalizedQuery)
        ))
  );
}

export function computeFocusCounts(tasks: Task[] | undefined) {
  return {
    high: tasks?.filter((task) => matchesFocus(task, "high")).length ?? 0,
    blocked: tasks?.filter((task) => matchesFocus(task, "blocked")).length ?? 0,
    overdue: tasks?.filter((task) => matchesFocus(task, "overdue")).length ?? 0,
    unassigned: tasks?.filter((task) => matchesFocus(task, "unassigned")).length ?? 0,
  };
}

/** Standardization queue: apply filters, then sort. */
export function filterStdTasks(tasks: StandardizationTask[], filters: StdFilters) {
  const q = filters.search.trim().toLowerCase();
  return tasks
    .filter((t) => {
      if (filters.missing !== "ALL" && !t.missing.includes(filters.missing)) return false;
      if (filters.project !== ALL && t.projectKey !== filters.project) return false;
      if (filters.status !== ALL && t.status !== filters.status) return false;
      if (filters.stale === "stale" && !t.isStale) return false;
      if (filters.stale === "healthy" && t.isStale) return false;
      if (q && ![t.jiraKey, t.summary, t.status, t.projectKey].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "missing-desc") {
        if (b.missing.length !== a.missing.length) return b.missing.length - a.missing.length;
        if (b.stateAgeDays !== a.stateAgeDays) return b.stateAgeDays - a.stateAgeDays;
        return a.jiraKey.localeCompare(b.jiraKey);
      }
      if (filters.sort === "stateAge-desc") return b.stateAgeDays - a.stateAgeDays;
      if (filters.sort === "updated-desc") {
        return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
      }
      return a.jiraKey.localeCompare(b.jiraKey);
    });
}
