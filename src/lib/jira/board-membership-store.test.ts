import { describe, expect, it, beforeEach } from "vitest";
import {
  getStoredBoardMembership,
  getMembershipReadModel,
  getMembershipRefreshStatus,
  saveBoardMembershipSnapshot,
  markMembershipForbidden,
  markMembershipFailed,
  markMembershipRefreshing,
  invalidateBoardMembership,
} from "./board-membership-store";
import { prisma } from "@/lib/prisma";

describe("board-membership-store", () => {
  const userId = "test-user-store-1";
  const userA = "test-user-alice";
  const userB = "test-user-bob";
  const projectKey = "TESTPRJ";
  const boardId = 901;

  beforeEach(async () => {
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
    const saved = await saveBoardMembershipSnapshot({
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
