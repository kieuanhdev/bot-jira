import { REQUIREMENT_BULK_FIELDS } from "@/lib/issues/standardization";
import type { Task, SortMode, FocusMode, StandardizationTask } from "./stale-types";

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

export function formatTimeSpent(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return minutes > 0 ? `${minutes}m` : `${seconds}s`;
}

export function formatDueDate(value: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getEstimationMissingLabel(
  task: StandardizationTask,
  allTasks: StandardizationTask[]
): string {
  const projectTasks = allTasks.filter((t) => t.projectKey === task.projectKey);
  const hasEst = projectTasks.some((t) => t.originalEstimateSeconds != null && t.originalEstimateSeconds > 0);
  const hasPts = projectTasks.some((t) => t.points != null && t.points > 0);

  if (hasPts && !hasEst) return "Thiếu Points";
  if (hasEst && !hasPts) return "Thiếu Estimate";
  return "Thiếu Points/Est";
}

export function buildMissingBulkFields(keys: Set<string>, tasks: StandardizationTask[]): string {
  const fields = new Set<string>();
  const selectedTasks = tasks.filter((t) => keys.has(t.jiraKey));
  const relevantTasks = selectedTasks.length > 0 ? selectedTasks : tasks;

  const relevantProjects = new Set(relevantTasks.map((t) => t.projectKey));
  const projectTasks = tasks.filter((t) => relevantProjects.has(t.projectKey));

  const hasEstimateUsage = projectTasks.some(
    (t) => t.originalEstimateSeconds != null && t.originalEstimateSeconds > 0
  );
  const hasPointsUsage = projectTasks.some((t) => t.points != null && t.points > 0);

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
