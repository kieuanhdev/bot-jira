import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getStoredBoardMembership,
  getMembershipReadModel,
  getMembershipRefreshStatus,
  saveBoardMembershipSnapshot,
  markMembershipForbidden,
  markMembershipFailed,
  markMembershipRefreshing,
} from "./board-membership-store";
import { prisma } from "@/lib/prisma";

type MockSnapshot = {
  id: string;
  userId: string;
  projectKey: string;
  boardId: number;
  generation?: string;
  state?: string;
  truncated?: boolean;
  itemCount?: number;
  backlogCount?: number;
  fetchedAt?: Date | null;
  expiresAt?: Date | null;
  staleUntil?: Date | null;
  lastErrorCode?: string | null;
  lastStartedAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastRequestedAt?: Date | null;
  refreshReason?: string | null;
};

type MockEntry = {
  snapshotId: string;
  generation: string;
  jiraKey: string;
  isBacklog: boolean;
};

type MockUser = {
  id: string;
  displayName: string;
  email: string;
  jiraUserEnc?: string | null;
  jiraTokenEnc?: string | null;
  jiraAuth?: string | null;
  jiraUsername?: string | null;
};

const snapshots = new Map<string, MockSnapshot>();
const entries = new Map<string, MockEntry[]>();
const users = new Map<string, MockUser>();

function snapshotKey(userId: string, projectKey: string, boardId: number) {
  return `${userId}:${projectKey}:${boardId}`;
}

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        upsert: vi.fn(async ({ where, create, update }: { where: { id: string }; create: MockUser; update: Partial<MockUser> }) => {
          const existing = users.get(where.id);
          const user: MockUser = { ...(existing || create), ...update };
          users.set(where.id, user);
          return user;
        }),
      },
      jiraBoardMembershipSnapshot: {
        deleteMany: vi.fn(async ({ where }: { where?: { userId?: string; projectKey?: string; boardId?: number } }) => {
          if (where?.userId && where?.projectKey && where?.boardId) {
            snapshots.delete(snapshotKey(where.userId, where.projectKey, where.boardId));
          } else if (where?.projectKey) {
            for (const [k, v] of snapshots.entries()) {
              if (v.projectKey === where.projectKey) {
                snapshots.delete(k);
              }
            }
          }
          return { count: 0 };
        }),
        findUnique: vi.fn(async ({ where }: { where: { id?: string; userId_projectKey_boardId?: { userId: string; projectKey: string; boardId: number } } }) => {
          if (where.userId_projectKey_boardId) {
            const { userId, projectKey, boardId } = where.userId_projectKey_boardId;
            return snapshots.get(snapshotKey(userId, projectKey, boardId)) ?? null;
          }
          if (where.id) {
            for (const v of snapshots.values()) {
              if (v.id === where.id) return v;
            }
          }
          return null;
        }),
        upsert: vi.fn(async ({ where, create, update }: { where: { userId_projectKey_boardId: { userId: string; projectKey: string; boardId: number } }; create: Partial<MockSnapshot>; update: Partial<MockSnapshot> }) => {
          const { userId, projectKey, boardId } = where.userId_projectKey_boardId;
          const key = snapshotKey(userId, projectKey, boardId);
          const existing = snapshots.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            snapshots.set(key, updated);
            return updated;
          }
          const created: MockSnapshot = { id: `snap_${Date.now()}_${Math.random()}`, userId, projectKey, boardId, ...create };
          snapshots.set(key, created);
          return created;
        }),
        update: vi.fn(async ({ where, data }: { where: { id?: string; userId_projectKey_boardId?: { userId: string; projectKey: string; boardId: number } }; data: Partial<MockSnapshot> }) => {
          let target: MockSnapshot | null = null;
          let targetKey = "";
          if (where.id) {
            for (const [k, v] of snapshots.entries()) {
              if (v.id === where.id) {
                target = v;
                targetKey = k;
                break;
              }
            }
          } else if (where.userId_projectKey_boardId) {
            const { userId, projectKey, boardId } = where.userId_projectKey_boardId;
            targetKey = snapshotKey(userId, projectKey, boardId);
            target = snapshots.get(targetKey) ?? null;
          }
          if (!target) throw new Error("Record not found");
          const updated = { ...target, ...data };
          snapshots.set(targetKey, updated);
          return updated;
        }),
      },
      jiraBoardMembershipEntry: {
        findMany: vi.fn(async ({ where, select }: { where: { snapshotId: string; generation?: string }; select?: { jiraKey?: boolean; isBacklog?: boolean } }) => {
          const list = entries.get(where.snapshotId) || [];
          return list
            .filter((e) => !where.generation || e.generation === where.generation)
            .map((e) => {
              if (select) {
                const res: { jiraKey?: string; isBacklog?: boolean } = {};
                if (select.jiraKey) res.jiraKey = e.jiraKey;
                if (select.isBacklog !== undefined) res.isBacklog = e.isBacklog;
                return res;
              }
              return e;
            });
        }),
        createMany: vi.fn(async ({ data }: { data: MockEntry[] }) => {
          for (const item of data) {
            const list = entries.get(item.snapshotId) || [];
            list.push(item);
            entries.set(item.snapshotId, list);
          }
          return { count: data.length };
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    },
  };
});

describe("board-membership-store", () => {
  const userId = "test-user-store-1";
  const userA = "test-user-alice";
  const userB = "test-user-bob";
  const projectKey = "TESTPRJ";
  const boardId = 901;

  beforeEach(async () => {
    snapshots.clear();
    entries.clear();
    users.clear();

    // Ensure test users exist
    for (const uid of [userId, userA, userB]) {
      await prisma.user.upsert({
        where: { id: uid },
        create: { id: uid, displayName: uid, email: `${uid}@test.local` },
        update: {},
      });
    }

    // Clean up test data
    await prisma.jiraBoardMembershipSnapshot
      .deleteMany({
        where: { projectKey },
      })
      .catch(() => {});
  });

  it("returns missing state when no snapshot exists", async () => {
    const res = await getStoredBoardMembership(userId, projectKey, boardId);
    expect(res.state).toBe("missing");
    expect(res.allKeys).toEqual([]);
    expect(res.stale).toBe(false);

    const model = await getMembershipReadModel(userId, projectKey, boardId);
    expect(model.state).toBe("missing");
  });

  it("saves a new generation atomically and reads fresh snapshot", async () => {
    const saved = await saveBoardMembershipSnapshot({
      userId,
      projectKey,
      boardId,
      boardKeys: ["TEST-1", "TEST-2"],
      backlogKeys: ["TEST-3", "TEST-2"],
      truncated: true,
    });

    expect(saved.state).toBe("fresh");
    expect(saved.allKeys).toEqual(["TEST-1", "TEST-2", "TEST-3"]);
    expect(saved.boardKeys).toEqual(["TEST-1"]);
    expect(saved.backlogKeys).toEqual(["TEST-2", "TEST-3"]);
    expect(saved.isBacklogMap["TEST-1"]).toBe(false);
    expect(saved.isBacklogMap["TEST-2"]).toBe(true);
    expect(saved.itemCount).toBe(3);
    expect(saved.backlogCount).toBe(2);
    expect(saved.truncated).toBe(true);

    // Read back
    const read = await getStoredBoardMembership(userId, projectKey, boardId);
    expect(read.state).toBe("fresh");
    expect(read.stale).toBe(false);
    expect(read.allKeys).toEqual(["TEST-1", "TEST-2", "TEST-3"]);
    expect(read.generation).toBe(saved.generation);
    expect(read.truncated).toBe(true);

    const status = await getMembershipRefreshStatus(userId, projectKey, boardId);
    expect(status.state).toBe("succeeded");
    expect(status.itemCount).toBe(3);
  });

  it("marks snapshot forbidden and refuses to serve stale data", async () => {
    // First save valid snapshot
    await saveBoardMembershipSnapshot({
      userId,
      projectKey,
      boardId,
      boardKeys: ["TEST-10"],
      backlogKeys: [],
    });

    // Mark forbidden
    await markMembershipForbidden(userId, projectKey, boardId, "board_forbidden");

    const read = await getStoredBoardMembership(userId, projectKey, boardId);
    expect(read.state).toBe("forbidden");
    expect(read.errorCode).toBe("board_forbidden");
    expect(read.allKeys).toEqual([]);

    const status = await getMembershipRefreshStatus(userId, projectKey, boardId);
    expect(status.state).toBe("forbidden");
  });

  it("preserves ready snapshot as stale during temporary failure", async () => {
    const saved = await saveBoardMembershipSnapshot({
      userId,
      projectKey,
      boardId,
      boardKeys: ["TEST-20"],
      backlogKeys: [],
    });

    // Mark snapshot as expired
    await prisma.jiraBoardMembershipSnapshot.update({
      where: { id: saved.snapshotId },
      data: {
        expiresAt: new Date(Date.now() - 10000), // 10s in past
        staleUntil: new Date(Date.now() + 60000), // still in stale window
      },
    });

    // Mark failure (e.g. 502/timeout from Jira)
    await markMembershipFailed(userId, projectKey, boardId, "jira_unavailable");

    const read = await getStoredBoardMembership(userId, projectKey, boardId);
    expect(read.state).toBe("stale");
    expect(read.stale).toBe(true);
    expect(read.allKeys).toEqual(["TEST-20"]);
  });

  it("returns refreshing_with_data when refreshing with an existing generation", async () => {
    await saveBoardMembershipSnapshot({
      userId,
      projectKey,
      boardId,
      boardKeys: ["TEST-30"],
      backlogKeys: [],
    });

    await markMembershipRefreshing(userId, projectKey, boardId, { reason: "scheduled" });

    const model = await getMembershipReadModel(userId, projectKey, boardId);
    expect(model.state).toBe("refreshing_with_data");
    expect(model.allKeys).toEqual(["TEST-30"]);

    const status = await getMembershipRefreshStatus(userId, projectKey, boardId);
    expect(status.state).toBe("running");
  });

  it("returns preparing/pending state when refreshing without a prior generation", async () => {
    await markMembershipRefreshing(userId, projectKey, boardId);

    const read = await getStoredBoardMembership(userId, projectKey, boardId);
    expect(read.state).toBe("pending");
    expect(read.allKeys).toEqual([]);

    const model = await getMembershipReadModel(userId, projectKey, boardId);
    expect(model.state).toBe("preparing");

    const status = await getMembershipRefreshStatus(userId, projectKey, boardId);
    expect(status.state).toBe("preparing");
  });

  it("isolates membership between different users", async () => {
    await saveBoardMembershipSnapshot({
      userId: userA,
      projectKey,
      boardId,
      boardKeys: ["ALICE-1"],
      backlogKeys: [],
    });

    const readB = await getStoredBoardMembership(userB, projectKey, boardId);
    expect(readB.state).toBe("missing");
    expect(readB.allKeys).toEqual([]);

    const readA = await getStoredBoardMembership(userA, projectKey, boardId);
    expect(readA.state).toBe("fresh");
    expect(readA.allKeys).toEqual(["ALICE-1"]);
  });
});
