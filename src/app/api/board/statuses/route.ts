import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList, hasJiraConfig, projectColumns } from "@/lib/env";
import { jira } from "@/lib/jira/client";

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
    select: { boardProjects: true },
  });
  if (!hasJiraConfig()) {
    return NextResponse.json({ items: [] as BoardStatus[], statusCategoryMap: {} as Record<string, string> });
  }

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").toUpperCase();
  const projectList = (url.searchParams.get("projectList") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let keys: string[];
  if (project && isKnownProject(project)) {
    keys = [project];
  } else if (projectList.length > 0) {
    keys = projectList.filter(isKnownProject);
  } else {
    const selected = (user?.boardProjects ?? []).filter(isKnownProject);
    keys = selected.length > 0 ? selected : jiraProjectList.filter(isKnownProject);
  }
  if (keys.length === 0) {
    return NextResponse.json({ items: [] as BoardStatus[], statusCategoryMap: {} as Record<string, string> });
  }

  const client = jira;

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
   * Auto-derive board columns from a project's workflow when none are
   * configured: keep every to-do and in-progress state (in workflow order) and
   * collapse all done-family states into a single "Done" column. This mirrors
   * how most Jira boards are laid out.
   */
  function autoColumns(states: FlowStatus[]): BoardStatus[] {
    const out: BoardStatus[] = [];
    let doneAdded = false;
    for (const s of states) {
      if (!s?.name) continue;
      const category = normalizeCategory(s.statusCategory?.key);
      if (category === "done") {
        if (!doneAdded) {
          out.push({ name: s.name, category });
          doneAdded = true;
        }
      } else {
        out.push({ name: s.name, category });
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
  // auto), de-duplicated by name, first-seen order.
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

  const items: BoardStatus[] = [...ordered.values()];
  const statusCategoryMap: Record<string, string> = Object.fromEntries(rawCategory);
  return NextResponse.json({ items, statusCategoryMap });
}
