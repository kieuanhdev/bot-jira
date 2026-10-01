import { projectBoardIds, boardBacklogColumns, projectColumns } from "@/lib/env";
import type { JiraBoard, JiraBoardConfiguration } from "./types";
import { JiraRequestError } from "./client";

export type CategoryKey = "new" | "indeterminate" | "done";

export type BoardStatus = {
  name: string;
  category: CategoryKey;
};

export type JiraBoardColumn = {
  id: string;
  name: string;
  statusIds: string[];
  statuses: Array<{ id: string; name: string }>;
  isBacklog: boolean;
  isDone: boolean;
};

export type BoardConfigSource = "jira_board" | "manual" | "workflow" | "default";

export type ResolvedBoardConfig = {
  projectKey: string;
  board: {
    id: number;
    name: string;
    type: string;
  } | null;
  selectedBoardId?: number | null;
  selectionSource?: "user_preference" | "environment_default" | "single_board" | "none";
  source: BoardConfigSource;
  columns: JiraBoardColumn[];
  backlogColumnId: string | null;
  backlogStatusIds: string[];
  fallbackReason: string | null;
  candidateBoards?: Array<{ id: number; name: string; type: string }>;
  fetchedAt: string;
  stale?: boolean;
  // Backward compatibility fields
  items: BoardStatus[];
  statusCategoryMap: Record<string, string>;
};

export interface JiraBoardClient {
  getBoardsForProject: (projectKey: string) => Promise<JiraBoard[]>;
  getBoardConfiguration: (boardId: number) => Promise<JiraBoardConfiguration>;
  getProjectStatuses: (projectKey: string) => Promise<Array<{
    subtask: boolean;
    statuses: Array<{ id?: string; name: string; statusCategory?: { key?: string } }>;
  }>>;
}

/** Normalize Jira's category key to a canonical key; falls back to "new". */
export function normalizeCategory(key?: string): CategoryKey {
  const k = (key ?? "").toLowerCase();
  if (k === "done") return "done";
  if (k === "indeterminate") return "indeterminate";
  return "new";
}

/**
 * Infer category from column label when Jira status category is not directly available.
 */
export function categoryFromLabel(label: string): CategoryKey {
  const l = label.toLowerCase();
  if (/(^|\s)(done|closed|resolved|complete|completed|released|deploy(?:ed)?|finish(?:ed)?)\b/.test(l) || l === "done")
    return "done";
  if (/(progress|doing|working|active)/.test(l)) return "indeterminate";
  return "new";
}

/**
 * Sort workflow status progression logically.
 */
export function getWorkflowRank(name: string, category: CategoryKey): number {
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
 * Backlog detection rules (Section 4.3):
 * 1. Configured override via JIRA_BOARD_BACKLOG_COLUMNS (by boardId or projectKey).
 * 2. Column whose normalized name is "backlog" (case-insensitive, whitespace stripped).
 * 3. Otherwise false. Never infer Backlog from statusCategory or first position.
 */
export function isBacklogColumn(
  columnName: string,
  boardId?: number | string | null,
  projectKey?: string | null
): boolean {
  const nameNorm = (columnName || "").trim().toLowerCase();
  if (!nameNorm) return false;

  // 1. Check override by boardId
  if (boardId !== undefined && boardId !== null) {
    const override = boardBacklogColumns[String(boardId)];
    if (override && override.trim().toLowerCase() === nameNorm) {
      return true;
    }
  }

  // Check override by projectKey
  if (projectKey) {
    const override = boardBacklogColumns[projectKey.toUpperCase()];
    if (override && override.trim().toLowerCase() === nameNorm) {
      return true;
    }
  }

  // 2. Normalized name matches "backlog"
  if (nameNorm.replace(/\s+/g, "") === "backlog") {
    return true;
  }

  return false;
}

type CacheEntry = {
  data: ResolvedBoardConfig;
  expiresAt: number;
  staleUntil: number;
};

const boardConfigCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<ResolvedBoardConfig>>();

const SUCCESS_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_TTL_MS = 1 * 60 * 1000; // 1 minute
const STALE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function clearBoardConfigCache(): void {
  boardConfigCache.clear();
  inFlightRequests.clear();
}

/**
 * Builds fallback columns from manual configuration or workflow statuses.
 */
export function buildFallbackConfig(
  projectKey: string,
  states: Array<{ id?: string; name: string; statusCategory?: { key?: string } }>,
  reason: string | null,
  candidateBoards?: Array<{ id: number; name: string; type: string }>
): ResolvedBoardConfig {
  const manual = projectColumns[projectKey.toUpperCase()];
  const rawCategory = new Map<string, CategoryKey>();
  const catByName = new Map<string, CategoryKey>();
  const statusIdByName = new Map<string, string>();
  const statusNameById = new Map<string, string>();

  for (const s of states) {
    if (s?.name) {
      const cat = normalizeCategory(s.statusCategory?.key);
      rawCategory.set(s.name, cat);
      catByName.set(s.name, cat);
      if (s.id) {
        statusIdByName.set(s.name, s.id);
        statusNameById.set(s.id, s.name);
      }
    }
  }

  let columns: JiraBoardColumn[] = [];
  let source: BoardConfigSource = "workflow";

  if (manual && manual.length > 0) {
    source = "manual";
    columns = manual.map((name, index) => {
      const cat = catByName.get(name) ?? categoryFromLabel(name);
      const isBacklog = isBacklogColumn(name, null, projectKey);
      const isDone = cat === "done";
      const statusId = statusIdByName.get(name);
      return {
        id: `manual:${projectKey}:${index}`,
        name,
        statusIds: statusId ? [statusId] : [],
        statuses: statusId ? [{ id: statusId, name }] : [{ id: name, name }],
        isBacklog,
        isDone,
      };
    });
  } else if (states.length > 0) {
    source = "workflow";
    const seen = new Set<string>();
    const candidates: Array<{ id?: string; name: string; category: CategoryKey }> = [];
    for (const s of states) {
      if (!s?.name) continue;
      const name = s.name.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      candidates.push({ id: s.id, name, category: normalizeCategory(s.statusCategory?.key) });
    }
    candidates.sort((a, b) => getWorkflowRank(a.name, a.category) - getWorkflowRank(b.name, b.category));

    let doneAdded = false;
    let colIdx = 0;
    for (const item of candidates) {
      if (item.category === "done") {
        if (!doneAdded) {
          const isBacklog = isBacklogColumn(item.name, null, projectKey);
          columns.push({
            id: `wf:${projectKey}:${colIdx++}`,
            name: item.name,
            statusIds: item.id ? [item.id] : [],
            statuses: item.id ? [{ id: item.id, name: item.name }] : [{ id: item.name, name: item.name }],
            isBacklog,
            isDone: true,
          });
          doneAdded = true;
        }
      } else {
        const isBacklog = isBacklogColumn(item.name, null, projectKey);
        columns.push({
          id: `wf:${projectKey}:${colIdx++}`,
          name: item.name,
          statusIds: item.id ? [item.id] : [],
          statuses: item.id ? [{ id: item.id, name: item.name }] : [{ id: item.name, name: item.name }],
          isBacklog,
          isDone: false,
        });
      }
    }
  }

  if (columns.length === 0) {
    source = "default";
    columns = [
      {
        id: `default:${projectKey}:0`,
        name: "To Do",
        statusIds: [],
        statuses: [],
        isBacklog: isBacklogColumn("To Do", null, projectKey),
        isDone: false,
      },
      {
        id: `default:${projectKey}:1`,
        name: "In Progress",
        statusIds: [],
        statuses: [],
        isBacklog: false,
        isDone: false,
      },
      {
        id: `default:${projectKey}:2`,
        name: "Done",
        statusIds: [],
        statuses: [],
        isBacklog: false,
        isDone: true,
      },
    ];
  }

  const backlogCol = columns.find((c) => c.isBacklog);
  const backlogColumnId = backlogCol ? backlogCol.id : null;
  const backlogStatusIds = backlogCol ? backlogCol.statusIds : [];

  const items: BoardStatus[] = columns.map((c) => ({
    name: c.name,
    category: c.isDone ? "done" : (catByName.get(c.name) ?? categoryFromLabel(c.name)),
  }));

  return {
    projectKey,
    board: null,
    selectedBoardId: null,
    selectionSource: "none",
    source,
    columns,
    backlogColumnId,
    backlogStatusIds,
    fallbackReason: reason,
    candidateBoards,
    fetchedAt: new Date().toISOString(),
    items,
    statusCategoryMap: Object.fromEntries(rawCategory),
  };
}

/**
 * Resolves Jira board configuration for a project following Section 4 & 5 of the plan.
 */
export async function resolveProjectBoardConfig(
  client: JiraBoardClient,
  projectKey: string,
  userScope = "default",
  preferredBoardId?: number | null
): Promise<ResolvedBoardConfig> {
  const cleanKey = projectKey.trim().toUpperCase();
  const normalizedPreferredId =
    preferredBoardId !== undefined && preferredBoardId !== null && Number.isInteger(preferredBoardId) && preferredBoardId > 0
      ? preferredBoardId
      : null;

  // Use normalized configuration cache key when boardId is known, else selection cache key
  const cacheKey = normalizedPreferredId
    ? `jira-board-config:${userScope}:board:${normalizedPreferredId}`
    : `jira-board-config:${userScope}:selection:${cleanKey}`;
  const now = Date.now();

  const cached = boardConfigCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  async function runFetch(): Promise<ResolvedBoardConfig> {
    let workflowStates: Array<{ id?: string; name: string; statusCategory?: { key?: string } }> = [];

    // Step 1: If boardId already provided, fetch statuses & board configuration in parallel
    if (normalizedPreferredId) {
      const [statusesResult, configResult] = await Promise.allSettled([
        client.getProjectStatuses(cleanKey),
        client.getBoardConfiguration(normalizedPreferredId),
      ]);

      if (statusesResult.status === "fulfilled") {
        const primary = statusesResult.value.find((t) => !t.subtask) ?? statusesResult.value[0];
        workflowStates = primary ? primary.statuses : [];
      }

      if (configResult.status === "rejected") {
        const err = configResult.reason;
        if (cached && now < cached.staleUntil) {
          return { ...cached.data, stale: true };
        }
        const status = err instanceof JiraRequestError ? err.status : null;
        let reason = "agile_api_error";
        if (status === 401 || status === 403) {
          reason = "permission_denied";
        } else if (status === 404) {
          reason = "board_not_found";
        }
        const fallback = buildFallbackConfig(cleanKey, workflowStates, reason);
        boardConfigCache.set(cacheKey, {
          data: fallback,
          expiresAt: now + FAILURE_TTL_MS,
          staleUntil: now + STALE_WINDOW_MS,
        });
        return fallback;
      }

      const config = configResult.value;
      const boardMeta = {
        id: config.id || normalizedPreferredId,
        name: config.name || `Board ${normalizedPreferredId}`,
        type: config.type || "kanban",
      };

      const statusMap = new Map<string, { id: string; name: string; category: CategoryKey }>();
      const rawCategory = new Map<string, CategoryKey>();
      for (const s of workflowStates) {
        if (s?.id && s?.name) {
          const cat = normalizeCategory(s.statusCategory?.key);
          statusMap.set(s.id, { id: s.id, name: s.name, category: cat });
          rawCategory.set(s.name, cat);
        }
      }

      const columns: JiraBoardColumn[] = [];
      const boardCols = config.columnConfig?.columns ?? [];

      for (let idx = 0; idx < boardCols.length; idx++) {
        const col = boardCols[idx];
        const statusIds = (col.statuses ?? []).map((s) => String(s.id));
        const statuses = statusIds.map((id) => {
          const known = statusMap.get(id);
          return known ? { id, name: known.name } : { id, name: id };
        });

        const isBacklog = isBacklogColumn(col.name, normalizedPreferredId, cleanKey);
        const hasDoneStatus = statusIds.some((id) => statusMap.get(id)?.category === "done");
        const isDone = hasDoneStatus || categoryFromLabel(col.name) === "done" || idx === boardCols.length - 1;

        columns.push({
          id: `${normalizedPreferredId}:${idx}`,
          name: col.name,
          statusIds,
          statuses,
          isBacklog,
          isDone,
        });
      }

      const backlogCol = columns.find((c) => c.isBacklog);
      const backlogColumnId = backlogCol ? backlogCol.id : null;
      const backlogStatusIds = backlogCol ? backlogCol.statusIds : [];

      const items: BoardStatus[] = columns.map((c) => ({
        name: c.name,
        category: c.isDone ? "done" : categoryFromLabel(c.name),
      }));

      const result: ResolvedBoardConfig = {
        projectKey: cleanKey,
        board: boardMeta,
        selectedBoardId: normalizedPreferredId,
        selectionSource: "user_preference",
        source: "jira_board",
        columns,
        backlogColumnId,
        backlogStatusIds,
        fallbackReason: null,
        fetchedAt: new Date().toISOString(),
        items,
        statusCategoryMap: Object.fromEntries(rawCategory),
      };

      boardConfigCache.set(cacheKey, {
        data: result,
        expiresAt: now + SUCCESS_TTL_MS,
        staleUntil: now + STALE_WINDOW_MS,
      });

      return result;
    }

    // Step 2: Auto selection path
    try {
      const types = await client.getProjectStatuses(cleanKey);
      const primary = types.find((t) => !t.subtask) ?? types[0];
      workflowStates = primary ? primary.statuses : [];
    } catch {
      // Best-effort workflow discovery
    }

    try {
      let targetBoardId: number | null = projectBoardIds[cleanKey] ?? null;
      let selectionSource: "user_preference" | "environment_default" | "single_board" | "none" =
        targetBoardId ? "environment_default" : "none";
      let candidateBoards: Array<{ id: number; name: string; type: string }> | undefined;
      let boardMeta: { id: number; name: string; type: string } | null = null;

      if (!targetBoardId) {
        const boards = await client.getBoardsForProject(cleanKey);
        if (!boards || boards.length === 0) {
          const fallback = buildFallbackConfig(cleanKey, workflowStates, "no_boards_found");
          boardConfigCache.set(cacheKey, {
            data: fallback,
            expiresAt: now + FAILURE_TTL_MS,
            staleUntil: now + STALE_WINDOW_MS,
          });
          return fallback;
        }

        if (boards.length === 1) {
          targetBoardId = boards[0].id;
          boardMeta = { id: boards[0].id, name: boards[0].name, type: boards[0].type };
          selectionSource = "single_board";
        } else {
          const kanbanBoard = boards.find((b) => b.type?.toLowerCase() === "kanban");
          if (kanbanBoard) {
            targetBoardId = kanbanBoard.id;
            boardMeta = { id: kanbanBoard.id, name: kanbanBoard.name, type: kanbanBoard.type };
            selectionSource = "environment_default";
          } else {
            candidateBoards = boards.map((b) => ({ id: b.id, name: b.name, type: b.type }));
            const fallback = buildFallbackConfig(
              cleanKey,
              workflowStates,
              "board_selection_required",
              candidateBoards
            );
            boardConfigCache.set(cacheKey, {
              data: fallback,
              expiresAt: now + FAILURE_TTL_MS,
              staleUntil: now + STALE_WINDOW_MS,
            });
            return fallback;
          }
        }
      }

      const config = await client.getBoardConfiguration(targetBoardId);
      if (!boardMeta) {
        boardMeta = {
          id: config.id || targetBoardId,
          name: config.name || `Board ${targetBoardId}`,
          type: config.type || "kanban",
        };
      }

      const statusMap = new Map<string, { id: string; name: string; category: CategoryKey }>();
      const rawCategory = new Map<string, CategoryKey>();
      for (const s of workflowStates) {
        if (s?.id && s?.name) {
          const cat = normalizeCategory(s.statusCategory?.key);
          statusMap.set(s.id, { id: s.id, name: s.name, category: cat });
          rawCategory.set(s.name, cat);
        }
      }

      const columns: JiraBoardColumn[] = [];
      const boardCols = config.columnConfig?.columns ?? [];

      for (let idx = 0; idx < boardCols.length; idx++) {
        const col = boardCols[idx];
        const statusIds = (col.statuses ?? []).map((s) => String(s.id));
        const statuses = statusIds.map((id) => {
          const known = statusMap.get(id);
          return known ? { id, name: known.name } : { id, name: id };
        });

        const isBacklog = isBacklogColumn(col.name, targetBoardId, cleanKey);
        const hasDoneStatus = statusIds.some((id) => statusMap.get(id)?.category === "done");
        const isDone = hasDoneStatus || categoryFromLabel(col.name) === "done" || idx === boardCols.length - 1;

        columns.push({
          id: `${targetBoardId}:${idx}`,
          name: col.name,
          statusIds,
          statuses,
          isBacklog,
          isDone,
        });
      }

      const backlogCol = columns.find((c) => c.isBacklog);
      const backlogColumnId = backlogCol ? backlogCol.id : null;
      const backlogStatusIds = backlogCol ? backlogCol.statusIds : [];

      const items: BoardStatus[] = columns.map((c) => ({
        name: c.name,
        category: c.isDone ? "done" : categoryFromLabel(c.name),
      }));

      const result: ResolvedBoardConfig = {
        projectKey: cleanKey,
        board: boardMeta,
        selectedBoardId: boardMeta?.id ?? targetBoardId,
        selectionSource,
        source: "jira_board",
        columns,
        backlogColumnId,
        backlogStatusIds,
        fallbackReason: null,
        fetchedAt: new Date().toISOString(),
        items,
        statusCategoryMap: Object.fromEntries(rawCategory),
      };

      // Populate both selection cache and board configuration cache
      const boardKey = `jira-board-config:${userScope}:board:${targetBoardId}`;
      const entry = {
        data: result,
        expiresAt: now + SUCCESS_TTL_MS,
        staleUntil: now + STALE_WINDOW_MS,
      };
      boardConfigCache.set(cacheKey, entry);
      boardConfigCache.set(boardKey, entry);

      return result;
    } catch (err: unknown) {
      if (cached && now < cached.staleUntil) {
        return { ...cached.data, stale: true };
      }

      const status = err instanceof JiraRequestError ? err.status : null;
      let reason = "agile_api_error";
      if (status === 401 || status === 403) {
        reason = "permission_denied";
      } else if (status === 404) {
        reason = "board_not_found";
      }

      const fallback = buildFallbackConfig(cleanKey, workflowStates, reason);
      boardConfigCache.set(cacheKey, {
        data: fallback,
        expiresAt: now + FAILURE_TTL_MS,
        staleUntil: now + STALE_WINDOW_MS,
      });
      return fallback;
    }
  }

  if (cached && now < cached.staleUntil) {
    const bgPromise = (async () => {
      try {
        return await runFetch();
      } catch {
        return cached.data;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();
    inFlightRequests.set(cacheKey, bgPromise);
    return { ...cached.data, stale: true };
  }

  const fetchPromise = runFetch();
  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
