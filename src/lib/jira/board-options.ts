import { prisma } from "@/lib/prisma";
import { projectBoardIds } from "@/lib/env";
import { createBoardCachePolicy } from "./board-cache-policy";
import { JiraRequestError, type JiraClient } from "./client";
import type { BoardOptionsResponse, BoardSelectionSource, JiraBoardOption } from "./types";

const optionsCache = createBoardCachePolicy<BoardOptionsResponse>({
  freshForMs: 5 * 60_000,
  staleForMs: 30 * 60_000,
  now: () => Date.now(),
});

export function clearBoardOptionsCache(userId?: string, projectKey?: string): void {
  if (userId && projectKey) {
    optionsCache.delete(`board-options:${userId}:${projectKey.trim().toUpperCase()}`);
  } else {
    optionsCache.clear();
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
  const cached = optionsCache.read(cacheKey);
  if (cached.state === "fresh") return cached.entry.data;

  // Stale-while-revalidate
  if (cached.state === "stale") {
    if (!optionsCache.hasInFlight(cacheKey)) {
      const bgPromise = (async () => {
        try {
          optionsCache.write(cacheKey, await runFetch());
        } catch (err: unknown) {
          if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
            optionsCache.delete(cacheKey);
          }
        }
      })();
      optionsCache.trackBackground(cacheKey, bgPromise);
    }
    return cached.entry.data;
  }

  const inFlight = optionsCache.getInFlight(cacheKey);
  if (inFlight) return inFlight;

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
    const pref = await prisma.userBoardPreference.findUnique({
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
        await prisma.userBoardPreference.deleteMany({
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
      optionsCache.write(cacheKey, result);
      return result;
    } catch (err: unknown) {
      if (err instanceof JiraRequestError && (err.status === 401 || err.status === 403)) {
        optionsCache.delete(cacheKey);
      }
      throw err;
    }
  })();

  optionsCache.track(cacheKey, fetchPromise);
  return fetchPromise;
}
