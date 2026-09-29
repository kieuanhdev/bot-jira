import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList, projectColumns } from "@/lib/env";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";

/**
 * Stable Jira status category key. Jira's canonical keys are `new` (to-do),
 * `indeterminate` (in progress) and `done`. Unlike the numeric `statusCategory.id`
 * (which is not canonical and can differ between custom workflow schemes /
 * instances), the key is stable across instances, so routing and styling key off it.
 */
export type CategoryKey = "new" | "indeterminate" | "done";

export type BoardStatus = {
  name: string;
  /** Stable Jira status category key (see CategoryKey). */
  category: CategoryKey;
};

/**
 * The board columns for the current project scope, **grouped by Jira
 * statusCategory** exactly like the Jira board does.
 *
 * Jira shows one column per status category (to-do / in-progress / done), using
 * the *first/representative* status of each category as the column header. So a
 * project whose workflow has 9 states (e.g. EPM) renders as ~6 columns, because
 * states that share a category (Done Test + Deploy + Reject → "Done",
 * Backlog + Reopened → "Backlog") collapse into a single column.
 *
 * - Single project: that project's workflow, grouped by category, in the order
 *   the categories first appear in the workflow.
 * - "All" (multiple projects): the union across projects, de-duplicated by
 *   category (a column is identified by its category + representative name).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      boardProjects: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
    },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").toUpperCase();
  const projectList = (url.searchParams.get("projectList") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const userBoardProjects = (user?.boardProjects ?? []).map((p) => p.trim().toUpperCase());
  const isAllowedProject = (k: string) =>
    isKnownProject(k) || userBoardProjects.includes(k) || /^[A-Z][A-Z0-9_]{1,19}$/.test(k);

  let keys: string[];
  if (project && isAllowedProject(project)) {
    keys = [project];
  } else if (projectList.length > 0) {
    keys = projectList.filter(isAllowedProject);
  } else {
    const selected = userBoardProjects.filter(isAllowedProject);
    keys = selected.length > 0 ? selected : jiraProjectList.filter(isKnownProject);
  }
  if (keys.length === 0) {
    return NextResponse.json({ items: [] as BoardStatus[], statusCategoryMap: {} as Record<string, string> });
  }

  const client = jiraWith(auth);

  type FlowStatus = { name: string; statusCategory: { key?: string } };
  type FlowType = { subtask: boolean; statuses: FlowStatus[] };

  /** Normalize Jira's category key to a canonical key; falls back to "new". */
  function normalizeCategory(key?: string): CategoryKey {
    const k = (key ?? "").toLowerCase();
    if (k === "done") return "done";
    if (k === "indeterminate") return "indeterminate";
    return "new";
  }

  /** Pick the primary issue type's statuses (first non-subtask, else first). */
  function primaryWorkflow(types: FlowType[]): FlowStatus[] {
    const primary = types.find((t) => !t.subtask) ?? types[0];
    return primary ? primary.statuses : [];
  }

  /**
   * Guess a column's category from its label when the label isn't a real
   * workflow status name (e.g. a column labelled "Done" that groups the
   * project's done-family states). Keyed on stable keywords, not instance ids.
   */
  function categoryFromLabel(label: string): CategoryKey {
    const l = label.toLowerCase();
    if (/(^|\s)(done|closed|resolved|complete|completed|released|deploy(?:ed)?|finish(?:ed)?)\b/.test(l) || l === "done")
      return "done";
    if (/(progress|doing|working|active)/.test(l)) return "indeterminate";
    return "new";
  }

  /**
   * Sort status progression logically:
   * 1. Backlog / Plan / Pending (rank 10-15)
   * 2. To do / Selected for Dev / Reopened (rank 20-25)
   * 3. In Progress (rank 30)
   * 4. In Review (rank 35)
   * 5. Waiting For Deploy (rank 40)
   * 6. Test / To Do Test / ToDo Test / READY FOR TEST (rank 50)
   * 7. Done Test / Done / Completed (rank 60)
   * 8. Released / Deploy (rank 65)
   * 9. Reject / Cancelled (rank 70)
   */
  function getWorkflowRank(name: string, category: CategoryKey): number {
    const n = (name || "").toLowerCase().trim();
    if (category === "new") {
      if (n.includes("backlog")) return 10;
      if (n.includes("plan")) return 11;
      if (n.includes("pending")) return 12;
      if (n.includes("select")) return 20;
      if (n.includes("to do") || n.includes("todo")) return 21;
      if (n.includes("reopen")) return 22;
      return 15;
    }
    if (category === "indeterminate") {
      if (n.includes("progress") || n.includes("doing") || n.includes("active")) return 30;
      if (n.includes("review")) return 35;
      if (n.includes("deploy") || n.includes("waiting for deploy") || n.includes("wating for deploy")) return 40;
      if (n.includes("test") || n.includes("qa")) return 50;
      return 32;
    }
    if (category === "done") {
      if (n.includes("done") || n.includes("resolved") || n.includes("complete")) return 60;
      if (n.includes("deploy") || n.includes("release")) return 65;
      if (n.includes("reject")) return 70;
      return 62;
    }
    return 100;
  }

  /**
   * Auto-derive board columns from a project's workflow when none are
   * configured: sort states logically by workflow stage, keep relevant to-do,
   * in-progress, review, test states, and collapse done-family states into the
   * primary Done column.
   */
  function autoColumns(states: FlowStatus[]): BoardStatus[] {
    const seen = new Set<string>();
    const candidates: BoardStatus[] = [];
    for (const s of states) {
      if (!s?.name) continue;
      const name = s.name.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      candidates.push({ name, category: normalizeCategory(s.statusCategory?.key) });
    }

    // Sort by workflow progression
    candidates.sort((a, b) => getWorkflowRank(a.name, a.category) - getWorkflowRank(b.name, b.category));

    const out: BoardStatus[] = [];
    let doneAdded = false;
    for (const item of candidates) {
      if (item.category === "done") {
        if (!doneAdded) {
          out.push(item);
          doneAdded = true;
        }
      } else {
        out.push(item);
      }
    }
    return out;
  }

  // Single-project case: use the project's columns (manual if configured, else
  // auto-derived), in order.
  if (keys.length === 1) {
    const key = keys[0];
    try {
      const types = await client.getProjectStatuses(key);
      const states = primaryWorkflow(types);
      // raw status name -> category key (for client-side column routing).
      const rawCategory = new Map<string, CategoryKey>();
      const catByName = new Map<string, CategoryKey>();
      for (const s of states) {
        if (s?.name) {
          const cat = normalizeCategory(s.statusCategory?.key);
          rawCategory.set(s.name, cat);
          catByName.set(s.name, cat);
        }
      }
      const manual = projectColumns[key];
      let items: BoardStatus[];
      if (manual) {
        // Manual columns: use the configured names (order preserved). A name that
        // is a real workflow status gets its true category; a display label that
        // isn't (e.g. "Done") gets a category inferred from its label so that
        // done-family issues route into it.
        items = manual.map((name) => ({
          name,
          category: catByName.get(name) ?? categoryFromLabel(name),
        }));
      } else {
        items = autoColumns(states);
      }
      const statusCategoryMap: Record<string, string> = Object.fromEntries(rawCategory);
      return NextResponse.json({ items, statusCategoryMap });
    } catch {
      return NextResponse.json({ items: [] as BoardStatus[], statusCategoryMap: {} as Record<string, string> });
    }
  }

  // "All" (multiple projects): union of each project's columns (manual or
  // auto), de-duplicated by name, sorted by workflow progression.
  const ordered = new Map<string, BoardStatus>();
  const rawCategory = new Map<string, CategoryKey>();
  await Promise.all(
    keys.map(async (key) => {
      try {
        const types = await client.getProjectStatuses(key);
        const states = primaryWorkflow(types);
        const catByName = new Map<string, CategoryKey>();
        for (const s of states) {
          if (s?.name) {
            const cat = normalizeCategory(s.statusCategory?.key);
            rawCategory.set(s.name, cat);
            catByName.set(s.name, cat);
          }
        }
        const manual = projectColumns[key];
        const cols: BoardStatus[] = manual
          ? manual.map((name) => ({ name, category: catByName.get(name) ?? categoryFromLabel(name) }))
          : autoColumns(states);
        for (const col of cols) {
          if (!ordered.has(col.name)) ordered.set(col.name, col);
        }
      } catch {
        // Best-effort per project; a failing project contributes nothing.
      }
    })
  );

  const items: BoardStatus[] = [...ordered.values()].sort(
    (a, b) => getWorkflowRank(a.name, a.category) - getWorkflowRank(b.name, b.category)
  );
  const statusCategoryMap: Record<string, string> = Object.fromEntries(rawCategory);
  return NextResponse.json({ items, statusCategoryMap });
}
