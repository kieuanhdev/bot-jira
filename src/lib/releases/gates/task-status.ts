import { releaseDoneCategories } from "@/lib/env";
import type { Blocker, GateResult, TaskInfo } from "./types";

/**
 * task_status — every release issue must sit in a done status category.
 *
 * - `unknown` (no recognizable category) makes the gate `unknown` (fail-safe:
 *   an unreadable category can never be treated as done).
 * - Any other non-done category makes the gate `failed`.
 */
export function taskStatusGate(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(releaseDoneCategories.map((c) => c.toLowerCase()));

  const unknowns: Blocker[] = [];
  const notDone: Blocker[] = [];

  for (const t of tasks) {
    const cat = (t.statusCategory ?? "").toLowerCase();
    if (cat === "unknown" || cat === "") {
      unknowns.push({
        jiraKey: t.jiraKey,
        source: "jira",
        reason: `status=${t.status} (category unreadable/unknown)`,
      });
    } else if (!doneCats.has(cat)) {
      notDone.push({
        jiraKey: t.jiraKey,
        source: "jira",
        reason: `status=${t.status} (category=${t.statusCategory})`,
      });
    }
  }

  if (notDone.length > 0) {
    return {
      gate: "task_status",
      state: "failed",
      summary: `${notDone.length} task(s) not in a done category`,
      blockers: notDone,
    };
  }
  if (unknowns.length > 0) {
    return {
      gate: "task_status",
      state: "unknown",
      summary: `${unknowns.length} task(s) have an unreadable status category`,
      blockers: unknowns,
    };
  }
  return {
    gate: "task_status",
    state: "passed",
    summary: tasks.length > 0 ? "All tasks are in a done category" : "No tasks",
    blockers: [],
  };
}
