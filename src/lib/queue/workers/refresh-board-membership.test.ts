import { describe, expect, it, beforeEach, vi } from "vitest";
import { runRefreshBoardMembership } from "./refresh-board-membership";
import { prisma } from "@/lib/prisma";
import * as boardMembership from "@/lib/jira/board-membership";
import * as creds from "@/lib/user-creds";
import { JiraRequestError } from "@/lib/jira/client";

vi.mock("@/lib/jira/client", async () => {
  const actual = await vi.importActual<any>("@/lib/jira/client");
  return {
    ...actual,
    jiraWith: vi.fn().mockReturnValue({}),
  };
});

describe("refresh-board-membership worker", () => {
  const testUserId = "test-worker-user-1";
  const projectKey = "WORKERPRJ";
  const boardId = 888;

  beforeEach(async () => {
    vi.restoreAllMocks();
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
    expect(snapshot?.entries.length).toBe(3);
    expect((snapshot as any)?.refreshReason).toBe("manual_retry");
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
