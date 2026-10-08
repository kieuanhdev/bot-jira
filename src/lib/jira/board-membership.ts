import { env } from "@/lib/env";
import { JiraRequestError, type JiraClient } from "./client";
import type { JiraBoard, JiraProject } from "./types";
import { createBoardCachePolicy } from "./board-cache-policy";

export type BoardMembership = {
  boardId: number;
  boardKeys: string[];
  backlogKeys: string[];
  allKeys: string[];
  isBacklogMap: Record<string, boolean>;
  fetchedAt: string;
  stale?: boolean;
  truncated?: boolean;
};

const MEMBERSHIP_TTL_MS = 2 * 60 * 1000; // 2 minutes fresh
const STALE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes stale window

const membershipCache = createBoardCachePolicy<BoardMembership>({
  freshForMs: MEMBERSHIP_TTL_MS,
  staleForMs: STALE_WINDOW_MS,
});

export function clearBoardMembershipCache(): void {
  membershipCache.clear();
}

/**
 * Validates that a board exists, the user has permission to access it,
 * and the board is associated with the given projectKey.
 * Throws JiraRequestError with descriptive codes if invalid.
 */
export async function validateBoardForProject(
  client: Pick<JiraClient, "getBoard" | "getBoardProjects" | "getBoardsForProject">,
  boardId: number,
  projectKey: string
): Promise<JiraBoard> {
  const cleanKey = projectKey.trim().toUpperCase();
  if (!cleanKey) {
    throw new JiraRequestError("Invalid project key", 400, false);
  }
  if (!Number.isInteger(boardId) || boardId <= 0) {
    throw new JiraRequestError(`Invalid boardId: ${boardId}`, 400, false);
  }

  let board: JiraBoard;
  try {
    board = await client.getBoard(boardId);
  } catch (err: unknown) {
    if (err instanceof JiraRequestError) {
      if (err.status === 404) {
        throw new JiraRequestError(`Board ${boardId} not found`, 404, false);
      }
      if (err.status === 401 || err.status === 403) {
        throw new JiraRequestError(`Forbidden access to board ${boardId}`, 403, false);
      }
    }
    throw err;
  }

  // Check 1: location projectKey
  const locationKey = board.location?.projectKey?.trim().toUpperCase();
  if (locationKey && locationKey === cleanKey) {
    return board;
  }

  // Check 2: board projects list
  try {
    const projects = await client.getBoardProjects(boardId);
    if (projects.some((p: JiraProject) => p.key?.trim().toUpperCase() === cleanKey)) {
      return board;
    }
  } catch {
    // Best-effort check via getBoardProjects
  }

  // Check 3: boards listed for project
  try {
    const boards = await client.getBoardsForProject(cleanKey);
    if (boards.some((b: JiraBoard) => b.id === boardId)) {
      return board;
    }
  } catch {
    // Best-effort check via getBoardsForProject
  }

  throw new JiraRequestError(
    `Board ${boardId} does not belong to project ${cleanKey}`,
    409,
    false
  );
}

/**
 * Fetches the set of issue keys and backlog keys directly from Jira Agile API.
 * Uses pagination up to maxIssues.
 */
export async function fetchBoardMembershipFromJira(
  client: Pick<JiraClient, "getBoardIssues" | "getBoardBacklog">,
  boardId: number,
  maxIssues = env.jiraBoardMembershipMaxIssues
): Promise<{
  boardKeys: string[];
  backlogKeys: string[];
  allKeys: string[];
  isBacklogMap: Record<string, boolean>;
  issuePages: number;
  backlogPages: number;
  truncated: boolean;
}> {
  const boardKeysSet = new Set<string>();
  const backlogKeysSet = new Set<string>();
  const boardKeysList: string[] = [];
  const backlogKeysList: string[] = [];
  const allKeysList: string[] = [];
  const isBacklogMap: Record<string, boolean> = {};

  const pageSize = 100;
  let truncated = false;
  let issuePages = 0;
  let backlogPages = 0;

  // 1. Fetch board issues
  const fetchBoardIssues = async () => {
    let startAt = 0;
    while (startAt < maxIssues) {
      issuePages++;
      const res = await client.getBoardIssues(boardId, {
        startAt,
        maxResults: pageSize,
      });
      const issues = res?.issues ?? [];
      for (const item of issues) {
        if (item?.key && !boardKeysSet.has(item.key)) {
          boardKeysSet.add(item.key);
          boardKeysList.push(item.key);
        }
      }
      if (
        issues.length === 0 ||
        (res?.total !== undefined
          ? startAt + issues.length >= res.total
          : issues.length < pageSize)
      ) {
        break;
      }
      startAt += issues.length;
      if (startAt >= maxIssues && res?.total && res.total > maxIssues) {
        truncated = true;
      }
    }
  };

  // 2. Fetch backlog issues in parallel (best-effort: some boards like Kanban don't support backlog endpoint)
  const fetchBacklogIssues = async () => {
    let startAt = 0;
    try {
      while (startAt < maxIssues) {
        backlogPages++;
        const res = await client.getBoardBacklog(boardId, {
          startAt,
          maxResults: pageSize,
        });
        const issues = res?.issues ?? [];
        for (const item of issues) {
          if (item?.key && !backlogKeysSet.has(item.key)) {
            backlogKeysSet.add(item.key);
            backlogKeysList.push(item.key);
          }
        }
        if (
          issues.length === 0 ||
          (res?.total !== undefined
            ? startAt + issues.length >= res.total
            : issues.length < pageSize)
        ) {
          break;
        }
        startAt += issues.length;
        if (startAt >= maxIssues && res?.total && res.total > maxIssues) {
          truncated = true;
        }
      }
    } catch (err: unknown) {
      // Backlog 400 or 404 is common on Kanban boards without a configured backlog, ignore
      if (err instanceof JiraRequestError && (err.status === 400 || err.status === 404)) {
        // No backlog supported for this board type
      } else if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
    }
  };

  await Promise.all([fetchBoardIssues(), fetchBacklogIssues()]);

  for (const key of boardKeysList) {
    allKeysList.push(key);
    isBacklogMap[key] = false;
  }
  for (const key of backlogKeysList) {
    if (!boardKeysSet.has(key)) {
      allKeysList.push(key);
    }
    isBacklogMap[key] = true;
  }

  return {
    boardKeys: boardKeysList,
    backlogKeys: backlogKeysList,
    allKeys: allKeysList,
    isBacklogMap,
    issuePages,
    backlogPages,
    truncated,
  };
}

/**
 * Fetches and caches in-memory the set of issue keys belonging to a board and its backlog.
 * Kept for backward compatibility and fallback sync mode.
 */
export async function getBoardMembership(
  client: Pick<JiraClient, "getBoardIssues" | "getBoardBacklog">,
  boardId: number,
  credentialScope = "default"
): Promise<BoardMembership> {
  if (!Number.isInteger(boardId) || boardId <= 0) {
    throw new JiraRequestError(`Invalid boardId: ${boardId}`, 400, false);
  }

  const cacheKey = `jira-board-membership:${credentialScope}:${boardId}`;
  const now = Date.now();

  const cacheRead = membershipCache.read(cacheKey, now);
  const cached = cacheRead.entry;
  if (cacheRead.state === "fresh") {
    return cacheRead.entry.data;
  }

  async function runFetch(): Promise<BoardMembership> {
    const raw = await fetchBoardMembershipFromJira(client, boardId);
    return {
      boardId,
      boardKeys: raw.boardKeys,
      backlogKeys: raw.backlogKeys,
      allKeys: raw.allKeys,
      isBacklogMap: raw.isBacklogMap,
      fetchedAt: new Date().toISOString(),
      truncated: raw.truncated,
    };
  }

  // Stale-While-Revalidate: return stale cache immediately and refresh in background
  if (cacheRead.state === "stale") {
    if (!membershipCache.hasInFlight(cacheKey)) {
      const bgPromise = (async () => {
        try {
          const fresh = await runFetch();
          membershipCache.write(cacheKey, fresh);
        } catch (err: unknown) {
          if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
            membershipCache.delete(cacheKey);
          }
        }
      })();
      membershipCache.track(cacheKey, bgPromise);
    }
    return { ...cacheRead.entry.data, stale: true };
  }

  const inFlight = membershipCache.getInFlight(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async (): Promise<BoardMembership> => {
    try {
      const result = await runFetch();
      membershipCache.write(cacheKey, result);
      return result;
    } catch (err: unknown) {
      if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
        membershipCache.delete(cacheKey);
        throw err;
      }
      if (cached && Date.now() < cached.staleUntil) {
        return { ...cached.data, stale: true };
      }
      throw err;
    }
  })();

  membershipCache.track(cacheKey, fetchPromise);
  return fetchPromise;
}
