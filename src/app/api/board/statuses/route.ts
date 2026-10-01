import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList } from "@/lib/env";
import {
  getProjectWorkflowConfig,
  type CategoryKey,
} from "@/lib/jira/project-workflow-store";

export type BoardStatus = {
  name: string;
  category: CategoryKey;
};

export type JiraBoardColumn = {
  id: string;
  name: string;
  statusIds: string[];
  statuses: Array<{ id: string; name: string }>;
  category?: string;
  isBacklog: boolean;
  isDone: boolean;
};

export type ResolvedBoardConfig = {
  projectKey: string;
  board: {
    id: number;
    name: string;
    type: string;
  } | null;
  selectedBoardId?: number | null;
  selectionSource?: "user_preference" | "environment_default" | "single_board" | "none";
  source: string;
  columns: JiraBoardColumn[];
  backlogColumnId: string | null;
  backlogStatusIds: string[];
  fallbackReason: string | null;
  candidateBoards?: Array<{ id: number; name: string; type: string }>;
  fetchedAt: string;
  stale?: boolean;
  items: BoardStatus[];
  statusCategoryMap: Record<string, string>;
};

export type { CategoryKey };

/**
 * The board columns and status mappings for the current project scope.
 * Pure PostgreSQL query, zero Jira calls, zero pg-boss writes.
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
    },
  });

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
    return NextResponse.json({
      projectKey: "",
      board: null,
      source: "default",
      columns: [],
      backlogColumnId: null,
      backlogStatusIds: [],
      fallbackReason: null,
      fetchedAt: new Date().toISOString(),
      items: [] as BoardStatus[],
      statusCategoryMap: {} as Record<string, string>,
    });
  }

  const t0 = Date.now();

  // Load workflow configs for requested projects
  const configs = await Promise.all(keys.map((k) => getProjectWorkflowConfig(k)));

  // If single project, map directly
  if (keys.length === 1) {
    const cfg = configs[0];
    const columns: JiraBoardColumn[] = cfg.columns.map((c) => {
      const isBacklog = c.name.toLowerCase() === "backlog";
      return {
        id: c.id,
        name: c.name,
        statusIds: c.statusIds,
        statuses: c.statuses,
        category: c.category,
        isBacklog,
        isDone: c.isDone,
      };
    });

    const backlogCol = columns.find((c) => c.isBacklog);
    const items: BoardStatus[] = columns.map((c) => ({
      name: c.name,
      category: (c.category as CategoryKey) || (c.isDone ? "done" : "new"),
    }));

    const response: ResolvedBoardConfig = {
      projectKey: keys[0],
      board: null,
      source: cfg.source,
      columns,
      backlogColumnId: backlogCol ? backlogCol.id : null,
      backlogStatusIds: backlogCol ? backlogCol.statusIds : [],
      fallbackReason: null,
      fetchedAt: cfg.fetchedAt,
      items,
      statusCategoryMap: cfg.statusCategoryMap,
    };

    const dur = Date.now() - t0;
    const headers = new Headers();
    headers.set("Server-Timing", `workflow_db;dur=${dur}`);
    return NextResponse.json(response, { headers });
  }

  // Multi-project union
  const mergedColumnsMap = new Map<string, JiraBoardColumn>();
  const mergedCategoryMap: Record<string, string> = {};

  for (const cfg of configs) {
    for (const [k, v] of Object.entries(cfg.statusCategoryMap)) {
      mergedCategoryMap[k] = v;
    }
    for (const col of cfg.columns) {
      const isBacklog = col.name.toLowerCase() === "backlog";
      if (!mergedColumnsMap.has(col.name)) {
        mergedColumnsMap.set(col.name, {
          id: col.id,
          name: col.name,
          statusIds: [...col.statusIds],
          statuses: [...col.statuses],
          isBacklog,
          isDone: col.isDone,
        });
      } else {
        const existing = mergedColumnsMap.get(col.name)!;
        existing.statusIds = Array.from(new Set([...existing.statusIds, ...col.statusIds]));
        const existingStatusIds = new Set(existing.statuses.map((s) => s.id));
        for (const s of col.statuses) {
          if (!existingStatusIds.has(s.id)) {
            existing.statuses.push(s);
            existingStatusIds.add(s.id);
          }
        }
      }
    }
  }

  const columns = Array.from(mergedColumnsMap.values());
  const backlogCol = columns.find((c) => c.isBacklog);
  const items: BoardStatus[] = columns.map((c) => ({
    name: c.name,
    category: (mergedCategoryMap[c.name] as CategoryKey) || (c.isDone ? "done" : "new"),
  }));

  const response: ResolvedBoardConfig = {
    projectKey: keys.join(","),
    board: null,
    source: configs.every((c) => c.source === "project_workflow") ? "project_workflow" : "issue_cache_fallback",
    columns,
    backlogColumnId: backlogCol ? backlogCol.id : null,
    backlogStatusIds: backlogCol ? backlogCol.statusIds : [],
    fallbackReason: null,
    fetchedAt: new Date().toISOString(),
    items,
    statusCategoryMap: mergedCategoryMap,
  };

  const dur = Date.now() - t0;
  const headers = new Headers();
  headers.set("Server-Timing", `workflow_db;dur=${dur}`);
  return NextResponse.json(response, { headers });
}
