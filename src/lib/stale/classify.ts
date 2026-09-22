import { statusGroup, type StatusGroup } from "@/lib/status-groups";
import { isBlockedStatus } from "./sla";
import type { TaskAges } from "./age";

export type StaleReason =
  | "no_assignee"
  | "waiting_to_start"
  | "in_progress_no_update"
  | "waiting_review"
  | "waiting_qa"
  | "waiting_other_team"
  | "blocked"
  | "unknown";

export const STALE_REASON_LABELS: Record<StaleReason, string> = {
  no_assignee: "No assignee",
  waiting_to_start: "Waiting to start",
  in_progress_no_update: "In progress, no update",
  waiting_review: "Waiting for review",
  waiting_qa: "Waiting for QA",
  waiting_other_team: "Waiting for other team",
  blocked: "Blocked",
  unknown: "Unknown",
};

interface ClassifyInput {
  status: string;
  statusCategory: string;
  assigneeJira: string | null;
  labels: string[];
  ages: TaskAges;
}

const OTHER_TEAM_LABELS = ["cross-team", "waiting-other", "waiting-team", "blocked-external", "dep-external"];

/**
 * Classify why a task is stale (M8-02).
 * Order of checks matters: no-assignee first, then blocked, then status-based.
 */
export function classifyStale(input: ClassifyInput): StaleReason {
  if (!input.assigneeJira) return "no_assignee";

  if (isBlockedStatus(input.status)) {
    const labelSet = input.labels.map((l) => l.toLowerCase());
    if (OTHER_TEAM_LABELS.some((k) => labelSet.some((l) => l.includes(k)))) {
      return "waiting_other_team";
    }
    return "blocked";
  }

  const group: StatusGroup = statusGroup(input.status);

  if (group === "In Review") {
    const s = input.status.toLowerCase();
    if (s.includes("qa") || s.includes("test") || s.includes("verification")) {
      return "waiting_qa";
    }
    return "waiting_review";
  }

  if (group === "In Progress") {
    return "in_progress_no_update";
  }

  if (group === "Backlog" || group === "To Do") {
    return "waiting_to_start";
  }

  return "unknown";
}
