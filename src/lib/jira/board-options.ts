import { prisma } from "@/lib/prisma";
import { projectBoardIds } from "@/lib/env";
import { JiraRequestError, type JiraClient } from "./client";
import type { BoardOptionsResponse, BoardSelectionSource, JiraBoardOption } from "./types";

type OptionsCacheEntry = {
  data: BoardOptionsResponse;
  expiresAt: number;
  staleUntil: number;
};

const optionsCache = new Map<string, OptionsCacheEntry>();
const inFlightOptions = new Map<string, Promise<BoardOptionsResponse>>();

const FRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function clearBoardOptionsCache(userId?: string, projectKey?: string): void {
  if (userId && projectKey) {
    const key = `board-options:${userId}:${projectKey.trim().toUpperCase()}`;
    optionsCache.delete(key);
    inFlightOptions.delete(key);
  } else {
    optionsCache.clear();
    inFlightOptions.clear();
  }
}

/**
 * Resolves board options for a project with per-user caching and request coalescing.
 */
export async function getBoardOptions(
  client: Pick<JiraClient, "getBoardsForProject">,
  userId: string,
  projectKey: string
): Promise<BoardOptionsResponse> {
  const cleanKey = projectKey.trim().toUpperCase();
  if (!cleanKey) {
    throw new JiraRequestError("Invalid project key", 400, false);
  }

  const cacheKey = `board-options:${userId}:${cleanKey}`;
  const now = Date.now();

  const cached = optionsCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  // Stale-while-revalidate
  if (cached && now < cached.staleUntil) {
    if (!inFlightOptions.has(cacheKey)) {
      const bgPromise = (async () => {
        try {
          const fresh = await runFetch();
          optionsCache.set(cacheKey, {
            data: fresh,
            expiresAt: Date.now() + FRESH_TTL_MS,
            staleUntil: Date.now() + STALE_WINDOW_MS,
          });
        } catch (err: unknown) {
          if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
            optionsCache.delete(cacheKey);
          }
        } finally {
          inFlightOptions.delete(cacheKey);
        }
      })();
      inFlightOptions.set(cacheKey, bgPromise as unknown as Promise<BoardOptionsResponse>);
    }
    return cached.data;
  }

  if (inFlightOptions.has(cacheKey)) {
    return inFlightOptions.get(cacheKey)!;
  }

  async function runFetch(): Promise<BoardOptionsResponse> {
    const rawBoards = await client.getBoardsForProject(cleanKey);
    const items: JiraBoardOption[] = rawBoards.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }));

    if (items.length === 0) {
      const res: BoardOptionsResponse = {
        projectKey: cleanKey,
        selectedBoardId: null,
        selectionSource: "none",
        requiresSelection: false,
        items: [],
      };
      return res;
    }

    // Step 1: Check user preference in DB
    const pref = await (prisma as any).userBoardPreference?.findUnique({
      where: {
        userId_projectKey: {
          userId,
          projectKey: cleanKey,
        },
      },
    });

    let selectedBoardId: number | null = null;
    let selectionSource: BoardSelectionSource = "none";

    if (pref) {
      const match = items.find((b) => b.id === pref.boardId);
      if (match) {
        selectedBoardId = pref.boardId;
        selectionSource = "user_preference";
      } else {
        // Preference is stale or board removed, clean it up
        await (prisma as any).userBoardPreference?.deleteMany({
          where: {
            userId,
            projectKey: cleanKey,
          },
        }).catch(() => {});
      }
    }

    // Step 2: Check environment default in projectBoardIds
    if (!selectedBoardId) {
      const envBoardId = projectBoardIds[cleanKey];
      if (envBoardId && items.some((b) => b.id === envBoardId)) {
        selectedBoardId = envBoardId;
        selectionSource = "environment_default";
      }
    }

    // Step 3: Single board case
    if (!selectedBoardId && items.length === 1) {
      selectedBoardId = items[0].id;
      selectionSource = "single_board";
    }

    // Step 4: Default to kanban board if available among candidates
    if (!selectedBoardId) {
      const kanbanBoard = items.find((b) => b.type?.toLowerCase() === "kanban");
      if (kanbanBoard) {
        selectedBoardId = kanbanBoard.id;
        selectionSource = items.length === 1 ? "single_board" : "environment_default";
      }
    }

    // Step 5: Multi-board case without selection
    const requiresSelection = items.length > 1 && selectedBoardId === null;

    const response: BoardOptionsResponse = {
      projectKey: cleanKey,
      selectedBoardId,
      selectionSource,
      requiresSelection,
      items,
    };

    return response;
  }

  const fetchPromise = (async (): Promise<BoardOptionsResponse> => {
    try {
      const result = await runFetch();
      optionsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + FRESH_TTL_MS,
        staleUntil: Date.now() + STALE_WINDOW_MS,
      });
      return result;
    } catch (err: unknown) {
      if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
        optionsCache.delete(cacheKey);
      }
      throw err;
    }
  })();

  inFlightOptions.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightOptions.delete(cacheKey);
  }
}
