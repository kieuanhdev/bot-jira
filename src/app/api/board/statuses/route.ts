import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList, hasJiraConfig, projectColumns } from "@/lib/env";
import { jira } from "@/lib/jira/client";

export type BoardStatus = {
  name: string;
  /** Jira statusCategory id: 2 = to do, 4 = in progress, 3 = done (on this DC). */
  categoryId: number;
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
    return NextResponse.json({ items: [] as BoardStatus[] });
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
  if (keys.length === 0) return NextResponse.json({ items: [] as BoardStatus[] });

  const client = jira;

  type FlowStatus = { name: string; statusCategory: { id: number } };
  type FlowType = { subtask: boolean; statuses: FlowStatus[] };

  /** Pick the primary issue type's statuses (first non-subtask, else first). */
  function primaryWorkflow(types: FlowType[]): FlowStatus[] {
    const primary = types.find((t) => !t.subtask) ?? types[0];
    return primary ? primary.statuses : [];
  }

  /**
   * Guess a column's status category from its label when the label isn't a
   * real workflow status name (e.g. a column labelled "Done" that groups the
   * project's done-family states). Returns a category id or 0 if unknown.
   * On this instance: 2 = to do, 4 = in progress, 3 = done.
   */
  function categoryFromLabel(label: string): number {
    const l = label.toLowerCase();
    if (/(^|\s)(done|closed|resolved|complete|released|deploy|finish|finishe?d)(\s|$)/.test(l) || l === "done")
      return 3;
    if (/(progress|in progress|doing|working|active)/.test(l)) return 4;
    if (/(todo|to do|backlog|new|open|pending|waiting|queued|review|test|selected)/.test(l)) return 2;
    return 0;
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
      const cat = s.statusCategory?.id ?? 0;
      if (isDoneCat(cat)) {
        if (!doneAdded) {
          out.push({ name: s.name, categoryId: cat });
          doneAdded = true;
        }
      } else {
        out.push({ name: s.name, categoryId: cat });
      }
    }
    return out;
  }

  const isDoneCat = (cat: number) => cat === 3 || cat === 5;

  // Single-project case: use the project's columns (manual if configured, else
  // auto-derived), in order.
  if (keys.length === 1) {
    const key = keys[0];
    try {
      const types = await client.getProjectStatuses(key);
      const states = primaryWorkflow(types);
      // raw status name -> category id (for client-side column routing).
      const rawCategory = new Map<string, number>();
      const catByName = new Map<string, number>();
      for (const s of states) {
        if (s?.name) {
          rawCategory.set(s.name, s.statusCategory?.id ?? 0);
          catByName.set(s.name, s.statusCategory?.id ?? 0);
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
          categoryId: catByName.get(name) ?? categoryFromLabel(name),
        }));
      } else {
        items = autoColumns(states);
      }
      const statusCategoryMap: Record<string, number> = Object.fromEntries(rawCategory);
      return NextResponse.json({ items, statusCategoryMap });
    } catch {
      return NextResponse.json({ items: [] as BoardStatus[], statusCategoryMap: {} });
    }
  }

  // "All" (multiple projects): union of each project's columns (manual or
  // auto), de-duplicated by name, first-seen order.
  const ordered = new Map<string, BoardStatus>();
  const rawCategory = new Map<string, number>();
  await Promise.all(
    keys.map(async (key) => {
      try {
        const types = await client.getProjectStatuses(key);
        const states = primaryWorkflow(types);
        const catByName = new Map<string, number>();
        for (const s of states) {
          if (s?.name) {
            rawCategory.set(s.name, s.statusCategory?.id ?? 0);
            catByName.set(s.name, s.statusCategory?.id ?? 0);
          }
        }
        const manual = projectColumns[key];
        const cols: BoardStatus[] = manual
          ? manual.map((name) => ({ name, categoryId: catByName.get(name) ?? categoryFromLabel(name) }))
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
  const statusCategoryMap: Record<string, number> = Object.fromEntries(rawCategory);
  return NextResponse.json({ items, statusCategoryMap });
}
