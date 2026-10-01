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

export function buildMissingBulkFields(keys: Set<string>, tasks: StandardizationTask[]): string {
  const fields = new Set<string>();
  for (const task of tasks) {
    if (keys.has(task.jiraKey)) {
      for (const req of task.missing) {
        if (req === "WORKLOG") continue;
        const bulkFields = REQUIREMENT_BULK_FIELDS[req] ?? [];
        for (const bf of bulkFields) fields.add(bf);
      }
    }
  }
  return fields.size > 0
    ? Array.from(fields).join(",")
    : "points,estimate,fixVersions,dueDate";
}
