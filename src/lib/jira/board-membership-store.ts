import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import crypto from "crypto";

export type MembershipReadModelState =
  | "fresh"
  | "stale"
  | "refreshing_with_data"
  | "preparing"
  | "missing"
  | "failed_with_data"
  | "failed_empty"
  | "forbidden";

export type StoredMembershipState =
  | MembershipReadModelState
  | "pending" // backward compatible alias for preparing
  | "failed"; // backward compatible alias for failed_empty / failed_with_data

export type StoredBoardMembership = {
  state: StoredMembershipState;
  snapshotId?: string;
  generation?: string;
  projectKey: string;
  boardId: number;
  boardKeys: string[];
  backlogKeys: string[];
  allKeys: string[];
  isBacklogMap: Record<string, boolean>;
  itemCount: number;
  backlogCount: number;
  fetchedAt?: Date | null;
  stale: boolean;
  truncated: boolean;
  errorCode?: string | null;
};

export interface SaveMembershipInput {
  userId: string;
  projectKey: string;
  boardId: number;
  boardKeys: string[];
  backlogKeys: string[];
  truncated?: boolean;
}

export interface BoardMembershipRefreshStatus {
  state: "preparing" | "running" | "succeeded" | "failed" | "forbidden" | "missing";
  lastStartedAt: Date | null;
  lastSuccessAt: Date | null;
  lastRequestedAt: Date | null;
  lastErrorCode: string | null;
  itemCount: number;
  lastJobId: string | null;
  refreshReason: string | null;
  stale: boolean;
}

/**
 * Pure read-only model from PostgreSQL for given (userId, projectKey, boardId).
 * Does not make external Jira API calls and does not enqueue background jobs.
 */
export async function getMembershipReadModel(
  userId: string,
  projectKey: string,
  boardId: number
): Promise<StoredBoardMembership> {
  const cleanKey = projectKey.trim().toUpperCase();
  const emptyResult: StoredBoardMembership = {
    state: "missing",
    projectKey: cleanKey,
    boardId,
    boardKeys: [],
    backlogKeys: [],
    allKeys: [],
    isBacklogMap: {},
    itemCount: 0,
    backlogCount: 0,
    stale: false,
    truncated: false,
  };

  if (!userId || !cleanKey || !Number.isInteger(boardId) || boardId <= 0) {
    return emptyResult;
  }

  const snapshot = await prisma.jiraBoardMembershipSnapshot.findUnique({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
  });

  if (!snapshot) {
    return emptyResult;
  }

  // Fire-and-forget record read touch for scheduler/prewarm targeting
  prisma.jiraBoardMembershipSnapshot
    .update({
      where: { id: snapshot.id },
      data: { lastRequestedAt: new Date() } as any,
    })
    .catch(() => {});

  // If marked forbidden (Jira 401/403), never serve stale data
  if (snapshot.state === "forbidden") {
    return {
      ...emptyResult,
      state: "forbidden",
      snapshotId: snapshot.id,
      errorCode: snapshot.lastErrorCode ?? "board_forbidden",
    };
  }

  const now = Date.now();
  const hasGeneration = Boolean(snapshot.generation && snapshot.generation.length > 0);
  const expiresAtMs = snapshot.expiresAt?.getTime() ?? 0;

  // Case 1: Snapshot has never completed a generation
  if (!hasGeneration || !snapshot.fetchedAt) {
    if (snapshot.state === "refreshing") {
      return {
        ...emptyResult,
        state: "preparing",
        snapshotId: snapshot.id,
      };
    }
    if (snapshot.state === "failed") {
      return {
        ...emptyResult,
        state: "failed_empty",
        snapshotId: snapshot.id,
        errorCode: snapshot.lastErrorCode ?? "membership_refresh_failed",
      };
    }
    return emptyResult;
  }

  // Case 2: We have a previously completed generation. Determine freshness and status.
  const isFresh = now < expiresAtMs && snapshot.state === "ready";

  // Fetch entries for active generation
  const entries = await prisma.jiraBoardMembershipEntry.findMany({
    where: {
      snapshotId: snapshot.id,
      generation: snapshot.generation,
    },
    select: {
      jiraKey: true,
      isBacklog: true,
    },
  });

  const boardKeys: string[] = [];
  const backlogKeys: string[] = [];
  const allKeys: string[] = [];
  const isBacklogMap: Record<string, boolean> = {};

  for (const entry of entries) {
    allKeys.push(entry.jiraKey);
    isBacklogMap[entry.jiraKey] = entry.isBacklog;
    if (entry.isBacklog) {
      backlogKeys.push(entry.jiraKey);
    } else {
      boardKeys.push(entry.jiraKey);
    }
  }

  let state: StoredMembershipState = isFresh ? "fresh" : "stale";
  if (snapshot.state === "refreshing") {
    state = "refreshing_with_data";
  } else if (snapshot.state === "failed") {
    state = "failed_with_data";
  }

  return {
    state,
    snapshotId: snapshot.id,
    generation: snapshot.generation,
    projectKey: cleanKey,
    boardId,
    boardKeys,
    backlogKeys,
    allKeys,
    isBacklogMap,
    itemCount: snapshot.itemCount,
    backlogCount: snapshot.backlogCount,
    fetchedAt: snapshot.fetchedAt,
    stale: !isFresh,
    truncated: (snapshot as any).truncated ?? false,
    errorCode: snapshot.lastErrorCode,
  };
}

/**
 * Backwards-compatible alias for getMembershipReadModel.
 */
export async function getStoredBoardMembership(
  userId: string,
  projectKey: string,
  boardId: number
): Promise<StoredBoardMembership> {
  const model = await getMembershipReadModel(userId, projectKey, boardId);
  // Ensure legacy test cases checking "pending" or "failed" match
  if (model.state === "preparing") {
    return { ...model, state: "pending" };
  }
  if (model.state === "failed_empty") {
    return { ...model, state: "failed" };
  }
  if (model.state === "failed_with_data") {
    return { ...model, state: "stale" };
  }
  return model;
}

/**
 * Status query for the membership status endpoint.
 */
export async function getMembershipRefreshStatus(
  userId: string,
  projectKey: string,
  boardId: number
): Promise<BoardMembershipRefreshStatus> {
  const cleanKey = projectKey.trim().toUpperCase();
  const empty: BoardMembershipRefreshStatus = {
    state: "missing",
    lastStartedAt: null,
    lastSuccessAt: null,
    lastRequestedAt: null,
    lastErrorCode: null,
    itemCount: 0,
    lastJobId: null,
    refreshReason: null,
    stale: false,
  };
  if (!userId || !cleanKey || !boardId || boardId <= 0) return empty;

  const snapshot = await prisma.jiraBoardMembershipSnapshot.findUnique({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
  });

  if (!snapshot) return empty;

  const now = Date.now();
  const isFresh = snapshot.expiresAt ? now < snapshot.expiresAt.getTime() : false;
  let statusState: BoardMembershipRefreshStatus["state"] = "missing";

  if (snapshot.state === "forbidden") {
    statusState = "forbidden";
  } else if (snapshot.state === "refreshing") {
    statusState = snapshot.generation && snapshot.fetchedAt ? "running" : "preparing";
  } else if (snapshot.state === "ready") {
    statusState = "succeeded";
  } else if (snapshot.state === "failed") {
    statusState = "failed";
  }

  const snapAny = snapshot as any;
  return {
    state: statusState,
    lastStartedAt: snapAny.lastStartedAt ?? null,
    lastSuccessAt: snapAny.lastSuccessAt ?? snapshot.fetchedAt,
    lastRequestedAt: snapAny.lastRequestedAt ?? null,
    lastErrorCode: snapshot.lastErrorCode,
    itemCount: snapshot.itemCount,
    lastJobId: snapAny.lastJobId ?? null,
    refreshReason: snapAny.refreshReason ?? null,
    stale: !isFresh,
  };
}

/**
 * Saves a new membership generation atomically for a board and switches active generation.
 */
export async function saveBoardMembershipSnapshot(input: SaveMembershipInput): Promise<StoredBoardMembership> {
  const { userId, projectKey, boardId, boardKeys, backlogKeys, truncated = false } = input;
  const cleanKey = projectKey.trim().toUpperCase();

  const freshTtlMs = env.jiraBoardMembershipFreshTtlSeconds * 1000;
  const staleTtlMs = env.jiraBoardMembershipStaleTtlSeconds * 1000;
  const now = Date.now();
  const newGeneration = crypto.randomUUID();

  // Deduplicate and separate board vs backlog
  const backlogSet = new Set(backlogKeys);
  const boardKeysList: string[] = [];
  const backlogKeysList: string[] = [];
  const allKeysList: string[] = [];
  const isBacklogMap: Record<string, boolean> = {};

  for (const k of boardKeys) {
    if (!isBacklogMap[k]) {
      if (backlogSet.has(k)) {
        isBacklogMap[k] = true;
        backlogKeysList.push(k);
      } else {
        isBacklogMap[k] = false;
        boardKeysList.push(k);
      }
      allKeysList.push(k);
    }
  }

  for (const k of backlogKeys) {
    if (isBacklogMap[k] === undefined) {
      isBacklogMap[k] = true;
      backlogKeysList.push(k);
      allKeysList.push(k);
    }
  }

  // 1. Ensure snapshot row exists
  const snapshot = await prisma.jiraBoardMembershipSnapshot.upsert({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
    create: {
      userId,
      projectKey: cleanKey,
      boardId,
      generation: newGeneration,
      state: "refreshing",
      truncated: Boolean(truncated),
    } as any,
    update: {
      // Keep active generation while writing new generation entries
    },
  });

  // 2. Insert new generation entries in batches
  const entryRows = allKeysList.map((jiraKey) => ({
    snapshotId: snapshot.id,
    generation: newGeneration,
    jiraKey,
    isBacklog: isBacklogMap[jiraKey] ?? false,
  }));

  const BATCH_SIZE = 500;
  for (let i = 0; i < entryRows.length; i += BATCH_SIZE) {
    const chunk = entryRows.slice(i, i + BATCH_SIZE);
    await prisma.jiraBoardMembershipEntry.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  // 3. Atomically switch generation to ready
  const updatedSnapshot = await prisma.jiraBoardMembershipSnapshot.update({
    where: { id: snapshot.id },
    data: {
      generation: newGeneration,
      state: "ready",
      itemCount: allKeysList.length,
      backlogCount: backlogKeysList.length,
      truncated: Boolean(truncated),
      fetchedAt: new Date(now),
      expiresAt: new Date(now + freshTtlMs),
      staleUntil: new Date(now + staleTtlMs),
      lastSuccessAt: new Date(now),
      lastErrorCode: null,
      lastErrorAt: null,
    } as any,
  });

  // 4. Delete old generations in the background / cleanup
  prisma.jiraBoardMembershipEntry
    .deleteMany({
      where: {
        snapshotId: snapshot.id,
        generation: { not: newGeneration },
      },
    })
    .catch((err: unknown) => {
      console.warn(`[board-membership-store] Cleanup of old generation failed for snapshot ${snapshot.id}:`, err);
    });

  return {
    state: "fresh",
    snapshotId: updatedSnapshot.id,
    generation: newGeneration,
    projectKey: cleanKey,
    boardId,
    boardKeys: boardKeysList,
    backlogKeys: backlogKeysList,
    allKeys: allKeysList,
    isBacklogMap,
    itemCount: allKeysList.length,
    backlogCount: backlogKeysList.length,
    fetchedAt: updatedSnapshot.fetchedAt,
    stale: false,
    truncated,
  };
}

/**
 * Marks snapshot as refreshing when worker starts or API detects pending refresh.
 * Preserves existing completed generation so readers can continue reading stale data.
 */
export async function markMembershipRefreshing(
  userId: string,
  projectKey: string,
  boardId: number,
  options?: { jobId?: string; reason?: string }
): Promise<void> {
  const cleanKey = projectKey.trim().toUpperCase();
  const now = new Date();
  await prisma.jiraBoardMembershipSnapshot.upsert({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
    create: {
      userId,
      projectKey: cleanKey,
      boardId,
      generation: "",
      state: "refreshing",
      lastStartedAt: now,
      lastJobId: options?.jobId ?? null,
      refreshReason: options?.reason ?? null,
    } as any,
    update: {
      state: "refreshing",
      lastStartedAt: now,
      ...(options?.jobId ? { lastJobId: options.jobId } : {}),
      ...(options?.reason ? { refreshReason: options.reason } : {}),
    } as any,
  });
}

/**
 * Marks snapshot as forbidden (Jira 401/403). Immediately invalidates stale data.
 */
export async function markMembershipForbidden(
  userId: string,
  projectKey: string,
  boardId: number,
  errorCode = "board_forbidden"
): Promise<void> {
  const cleanKey = projectKey.trim().toUpperCase();
  await prisma.jiraBoardMembershipSnapshot.upsert({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
    create: {
      userId,
      projectKey: cleanKey,
      boardId,
      generation: "",
      state: "forbidden",
      lastErrorCode: errorCode,
      lastErrorAt: new Date(),
      expiresAt: null,
      staleUntil: null,
    },
    update: {
      state: "forbidden",
      lastErrorCode: errorCode,
      lastErrorAt: new Date(),
      expiresAt: null,
      staleUntil: null,
    },
  });
}

/**
 * Marks snapshot as failed (e.g. 5xx/timeout). Retains previous ready snapshot if valid.
 */
export async function markMembershipFailed(
  userId: string,
  projectKey: string,
  boardId: number,
  errorCode = "membership_refresh_failed"
): Promise<void> {
  const cleanKey = projectKey.trim().toUpperCase();
  const existing = await prisma.jiraBoardMembershipSnapshot.findUnique({
    where: {
      userId_projectKey_boardId: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    },
  });

  if (!existing || !existing.generation || !existing.fetchedAt) {
    await prisma.jiraBoardMembershipSnapshot.upsert({
      where: {
        userId_projectKey_boardId: {
          userId,
          projectKey: cleanKey,
          boardId,
        },
      },
      create: {
        userId,
        projectKey: cleanKey,
        boardId,
        generation: "",
        state: "failed",
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
      },
      update: {
        state: "failed",
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
      },
    });
  } else {
    // Retain generation; mark state failed with lastErrorCode so stale reads can flag warning
    await prisma.jiraBoardMembershipSnapshot.update({
      where: { id: existing.id },
      data: {
        state: "failed",
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
      },
    });
  }
}

/**
 * Invalidate a snapshot (e.g. when board preference is updated or board deleted).
 */
export async function invalidateBoardMembership(
  userId: string,
  projectKey: string,
  boardId: number
): Promise<void> {
  const cleanKey = projectKey.trim().toUpperCase();
  await prisma.jiraBoardMembershipSnapshot
    .deleteMany({
      where: {
        userId,
        projectKey: cleanKey,
        boardId,
      },
    })
    .catch(() => {});
}
