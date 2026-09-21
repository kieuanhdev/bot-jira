import { releaseDoneCategories, releaseBlockingPriorities } from "@/lib/env";
import type { Blocker, GateResult, TaskInfo } from "./types";

const BUG_TYPES = new Set(["bug", "defect"]);

function isBugType(issueType: string | undefined | null): boolean {
  const t = (issueType ?? "").trim().toLowerCase();
  if (BUG_TYPES.has(t)) return true;
  // Some Jira installs use custom names such as "Story" variants; treat
  // explicit "bug"/"defect" substrings as defects.
  return t.includes("bug") || t.includes("defect");
}

/**
 * critical_bugs — no open Bug/Defect issue with a release-blocking priority.
 *
 * "Done" is determined by the configured done categories (not hard-coded
 * `done`), so a workflow that closes bugs into e.g. `Won't Do` (category
 * `done`) does not block.
 */
export function criticalBugsGate(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(releaseDoneCategories.map((c) => c.toLowerCase()));
  const blockingPrios = new Set(releaseBlockingPriorities.map((p) => p.toLowerCase()));

  const open: Blocker[] = [];
  for (const t of tasks) {
    if (!isBugType(t.issueType)) continue;
    const cat = (t.statusCategory ?? "").toLowerCase();
    if (doneCats.has(cat)) continue; // already closed
    if (!blockingPrios.has((t.priority ?? "").toLowerCase())) continue;
    open.push({
      jiraKey: t.jiraKey,
      source: "jira",
      reason: `open ${t.priority} bug (status=${t.status}, category=${t.statusCategory})`,
    });
  }

  if (open.length > 0) {
    return {
      gate: "critical_bugs",
      state: "failed",
      summary: `${open.length} open Blocker/Critical bug(s)`,
      blockers: open,
    };
  }
  return {
    gate: "critical_bugs",
    state: "passed",
    summary: "No open Blocker/Critical bugs",
    blockers: [],
  };
}
