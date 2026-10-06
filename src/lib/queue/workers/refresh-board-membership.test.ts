import { describe, expect, it, beforeEach, vi } from "vitest";
import { runRefreshBoardMembership } from "./refresh-board-membership";
import { prisma } from "@/lib/prisma";
import * as boardMembership from "@/lib/jira/board-membership";
import * as creds from "@/lib/user-creds";
import { JiraRequestError } from "@/lib/jira/client";

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
  entries?: MockEntry[];
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

vi.mock("@/lib/jira/client", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/jira/client");
  return {
    ...actual,
    jiraWith: vi.fn().mockReturnValue({}),
  };
});

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        upsert: vi.fn(async ({ where, create, update }: { where: { id: string }; create: MockUser; update: Partial<MockUser> }) => {
          const user: MockUser = { ...(users.get(where.id) || create), ...update };
          users.set(where.id, user);
          return user;
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return users.get(where.id) ?? null;
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
        findUnique: vi.fn(async ({ where, include }: { where: { id?: string; userId_projectKey_boardId?: { userId: string; projectKey: string; boardId: number } }; include?: { entries?: boolean } }) => {
          let found: MockSnapshot | null = null;
          if (where.userId_projectKey_boardId) {
            const { userId, projectKey, boardId } = where.userId_projectKey_boardId;
            found = snapshots.get(snapshotKey(userId, projectKey, boardId)) ?? null;
          } else if (where.id) {
            for (const v of snapshots.values()) {
              if (v.id === where.id) {
                found = v;
                break;
              }
            }
          }
          if (found && include?.entries) {
            return {
              ...found,
              entries: entries.get(found.id) || [],
            };
          }
          return found;
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

describe("refresh-board-membership worker", () => {
  const testUserId = "test-worker-user-1";
  const projectKey = "WORKERPRJ";
  const boardId = 888;

  beforeEach(async () => {
    vi.restoreAllMocks();
    snapshots.clear();
    entries.clear();
    users.clear();
    await prisma.user.upsert({
      where: { id: testUserId },
      create: {
        id: testUserId,
        displayName: "Worker User",
        email: "worker-user@test.local",
      },
      update: {},
    });

    await prisma.jiraBoardMembershipSnapshot.deleteMany({
      where: { projectKey },
    }).catch(() => {});
  });

  it("fails when user has no Jira credentials and marks forbidden", async () => {
    vi.spyOn(creds, "userJiraAuth").mockReturnValue(null);

    const result = await runRefreshBoardMembership({
      userId: testUserId,
      projectKey,
      boardId,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("lacks Jira credentials");

    const snapshot = await prisma.jiraBoardMembershipSnapshot.findUnique({
      where: {
        userId_projectKey_boardId: {
          userId: testUserId,
          projectKey,
          boardId,
        },
      },
    });
    expect(snapshot?.state).toBe("forbidden");
  });

  it("handles successful board membership refresh", async () => {
    vi.spyOn(creds, "userJiraAuth").mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    vi.spyOn(boardMembership, "validateBoardForProject").mockResolvedValue({
      id: boardId,
      name: "Worker Board",
      type: "scrum",
    });
    vi.spyOn(boardMembership, "fetchBoardMembershipFromJira").mockResolvedValue({
      boardKeys: ["WORKER-1", "WORKER-2"],
      backlogKeys: ["WORKER-3"],
      allKeys: ["WORKER-1", "WORKER-2", "WORKER-3"],
      isBacklogMap: { "WORKER-1": false, "WORKER-2": false, "WORKER-3": true },
      issuePages: 1,
      backlogPages: 1,
      truncated: false,
    });

    const result = await runRefreshBoardMembership({
      userId: testUserId,
      projectKey,
      boardId,
      reason: "manual_retry",
    });

    expect(result.ok).toBe(true);
    expect(result.stats?.itemCount).toBe(3);
    expect(result.stats?.backlogCount).toBe(1);

    const snapshot = await prisma.jiraBoardMembershipSnapshot.findUnique({
      where: {
        userId_projectKey_boardId: {
          userId: testUserId,
          projectKey,
          boardId,
        },
      },
      include: { entries: true },
    });

    expect(snapshot?.state).toBe("ready");
    expect(snapshot?.itemCount).toBe(3);
    expect(snapshot?.entries?.length).toBe(3);
    expect(snapshot?.refreshReason).toBe("manual_retry");
  });

  it("marks forbidden when Jira returns 403 on board validation", async () => {
    vi.spyOn(creds, "userJiraAuth").mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    vi.spyOn(boardMembership, "validateBoardForProject").mockRejectedValue(
      new JiraRequestError("Forbidden", 403, false)
    );

    const result = await runRefreshBoardMembership({
      userId: testUserId,
      projectKey,
      boardId,
    });

    expect(result.ok).toBe(false);

    const snapshot = await prisma.jiraBoardMembershipSnapshot.findUnique({
      where: {
        userId_projectKey_boardId: {
          userId: testUserId,
          projectKey,
          boardId,
        },
      },
    });
    expect(snapshot?.state).toBe("forbidden");
    expect(snapshot?.lastErrorCode).toBe("board_forbidden");
  });
});
