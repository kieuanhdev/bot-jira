import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  upsertPreference: vi.fn(),
  validateBoardForProject: vi.fn(),
  getStoredBoardMembership: vi.fn(),
  enqueueBoardMembershipRefresh: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    userBoardPreference: {
      upsert: mocks.upsertPreference,
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn().mockImplementation((user) =>
    user?.jiraTokenEnc ? { user: "test_user", token: "tok", authMode: "Bearer" } : null
  ),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({}),
  JiraRequestError: class extends Error {
    status: number;
    constructor(msg: string, status = 500) {
      super(msg);
      this.status = status;
    }
  },
}));
vi.mock("@/lib/jira/board-membership", () => ({
  validateBoardForProject: mocks.validateBoardForProject,
}));
vi.mock("@/lib/jira/board-membership-store", () => ({
  getStoredBoardMembership: mocks.getStoredBoardMembership,
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueBoardMembershipRefresh: mocks.enqueueBoardMembershipRefresh,
}));

import { PUT } from "./route";
import { JiraRequestError } from "@/lib/jira/client";

describe("/api/me/board-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      jiraTokenEnc: "enc",
      jiraUserEnc: "enc",
      jiraUsername: "test_user",
    });
    mocks.getStoredBoardMembership.mockResolvedValue({
      state: "missing",
      allKeys: [],
    });
    mocks.enqueueBoardMembershipRefresh.mockResolvedValue("job-pref-1");
  });

  describe("PUT", () => {
    it("returns 401 when unauthorized", async () => {
      mocks.session.mockResolvedValue(null);
      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 101 }),
        })
      );
      expect(res.status).toBe(401);
    });

    it("returns 428 when user has no Jira credentials", async () => {
      mocks.user.mockResolvedValue({ id: "user-1", jiraTokenEnc: null });
      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 101 }),
        })
      );
      expect(res.status).toBe(428);
    });

    it("returns 400 on invalid projectKey or boardId", async () => {
      const res1 = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "invalid_key!!!", boardId: 101 }),
        })
      );
      expect(res1.status).toBe(400);

      const res2 = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: -5 }),
        })
      );
      expect(res2.status).toBe(400);
    });

    it("returns 409 when board belongs to different project", async () => {
      mocks.validateBoardForProject.mockRejectedValue(
        new JiraRequestError("Board mismatch", 409, false)
      );

      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 999 }),
        })
      );
      expect(res.status).toBe(409);
    });

    it("upserts preference, enqueues refresh when missing, and returns membership state", async () => {
      mocks.validateBoardForProject.mockResolvedValue({
        id: 101,
        name: "EPM Scrum Board",
        type: "scrum",
      });

      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 101 }),
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projectKey).toBe("EPM");
      expect(body.preferenceSaved).toBe(true);
      expect(body.board).toEqual({
        id: 101,
        name: "EPM Scrum Board",
        type: "scrum",
      });
      expect(body.membership).toEqual({
        state: "preparing",
        jobId: "job-pref-1",
      });
      expect(mocks.enqueueBoardMembershipRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          projectKey: "EPM",
          boardId: 101,
          priority: "high",
          reason: "preference_saved",
        })
      );
    });

    it("does not enqueue refresh when snapshot is already fresh", async () => {
      mocks.validateBoardForProject.mockResolvedValue({
        id: 101,
        name: "EPM Scrum Board",
        type: "scrum",
      });
      mocks.getStoredBoardMembership.mockResolvedValue({
        state: "fresh",
        allKeys: ["EPM-1"],
      });

      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 101 }),
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.membership).toEqual({
        state: "fresh",
        jobId: null,
      });
      expect(mocks.enqueueBoardMembershipRefresh).not.toHaveBeenCalled();
    });

    it("returns queue_failed state when enqueue rejects", async () => {
      mocks.validateBoardForProject.mockResolvedValue({
        id: 101,
        name: "EPM Scrum Board",
        type: "scrum",
      });
      mocks.enqueueBoardMembershipRefresh.mockRejectedValue(new Error("Queue offline"));

      const res = await PUT(
        new Request("http://localhost/api/me/board-preferences", {
          method: "PUT",
          body: JSON.stringify({ projectKey: "EPM", boardId: 101 }),
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferenceSaved).toBe(true);
      expect(body.membership).toEqual({
        state: "queue_failed",
        jobId: null,
      });
    });
  });
});
