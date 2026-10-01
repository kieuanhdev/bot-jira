import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  validateBoardForProject,
  getBoardMembership,
  clearBoardMembershipCache,
} from "./board-membership";
import { JiraRequestError } from "./client";

describe("board-membership", () => {
  beforeEach(() => {
    clearBoardMembershipCache();
  });

  describe("validateBoardForProject", () => {
    it("validates when board location projectKey matches", async () => {
      const mockClient = {
        getBoard: vi.fn().mockResolvedValue({
          id: 101,
          name: "EPM Board",
          type: "scrum",
          location: { projectKey: "EPM" },
        }),
        getBoardProjects: vi.fn(),
        getBoardsForProject: vi.fn(),
      };

      const board = await validateBoardForProject(mockClient, 101, "EPM");
      expect(board.id).toBe(101);
      expect(mockClient.getBoard).toHaveBeenCalledWith(101);
      expect(mockClient.getBoardProjects).not.toHaveBeenCalled();
    });

    it("validates when board projects list contains projectKey", async () => {
      const mockClient = {
        getBoard: vi.fn().mockResolvedValue({
          id: 102,
          name: "Shared Board",
          type: "kanban",
          location: {},
        }),
        getBoardProjects: vi.fn().mockResolvedValue([
          { key: "OTHER", name: "Other Project" },
          { key: "EPM", name: "EPM Project" },
        ]),
        getBoardsForProject: vi.fn(),
      };

      const board = await validateBoardForProject(mockClient, 102, "EPM");
      expect(board.id).toBe(102);
      expect(mockClient.getBoardProjects).toHaveBeenCalledWith(102);
    });

    it("validates when project board discovery contains boardId", async () => {
      const mockClient = {
        getBoard: vi.fn().mockResolvedValue({
          id: 103,
          name: "Discovered Board",
          type: "scrum",
        }),
        getBoardProjects: vi.fn().mockRejectedValue(new Error("not supported")),
        getBoardsForProject: vi.fn().mockResolvedValue([
          { id: 103, name: "Discovered Board", type: "scrum" },
        ]),
      };

      const board = await validateBoardForProject(mockClient, 103, "EPM");
      expect(board.id).toBe(103);
    });

    it("throws 409 board_project_mismatch when board belongs to different project", async () => {
      const mockClient = {
        getBoard: vi.fn().mockResolvedValue({
          id: 104,
          name: "Other Board",
          type: "scrum",
          location: { projectKey: "OTHER" },
        }),
        getBoardProjects: vi.fn().mockResolvedValue([{ key: "OTHER", name: "Other Project" }]),
        getBoardsForProject: vi.fn().mockResolvedValue([]),
      };

      await expect(validateBoardForProject(mockClient, 104, "EPM")).rejects.toThrowError(
        /does not belong to project EPM/
      );
    });

    it("propagates 404 when board does not exist", async () => {
      const mockClient = {
        getBoard: vi.fn().mockRejectedValue(new JiraRequestError("Not found", 404, false)),
        getBoardProjects: vi.fn(),
        getBoardsForProject: vi.fn(),
      };

      await expect(validateBoardForProject(mockClient, 999, "EPM")).rejects.toThrowError(
        /Board 999 not found/
      );
    });

    it("propagates 403 when user lacks permission to view board", async () => {
      const mockClient = {
        getBoard: vi.fn().mockRejectedValue(new JiraRequestError("Forbidden", 403, false)),
        getBoardProjects: vi.fn(),
        getBoardsForProject: vi.fn(),
      };

      await expect(validateBoardForProject(mockClient, 105, "EPM")).rejects.toThrowError(
        /Forbidden access to board 105/
      );
    });
  });

  describe("getBoardMembership", () => {
    it("fetches and merges board issues and backlog issues with pagination", async () => {
      const mockClient = {
        getBoardIssues: vi.fn()
          .mockResolvedValueOnce({
            startAt: 0,
            maxResults: 2,
            total: 3,
            issues: [
              { id: "1", key: "EPM-1", fields: {} },
              { id: "2", key: "EPM-2", fields: {} },
            ],
          })
          .mockResolvedValueOnce({
            startAt: 2,
            maxResults: 2,
            total: 3,
            issues: [{ id: "3", key: "EPM-3", fields: {} }],
          }),
        getBoardBacklog: vi.fn().mockResolvedValueOnce({
          startAt: 0,
          maxResults: 100,
          total: 2,
          issues: [
            { id: "4", key: "EPM-4", fields: {} },
            { id: "2", key: "EPM-2", fields: {} }, // Duplicate with board issue
          ],
        }),
      };

      const membership = await getBoardMembership(mockClient as any, 101, "user1");
      expect(membership.boardId).toBe(101);
      expect(membership.boardKeys).toEqual(["EPM-1", "EPM-2", "EPM-3"]);
      expect(membership.backlogKeys).toEqual(["EPM-4", "EPM-2"]);
      expect(membership.allKeys).toEqual(["EPM-1", "EPM-2", "EPM-3", "EPM-4"]);
      expect(membership.isBacklogMap["EPM-1"]).toBe(false);
      expect(membership.isBacklogMap["EPM-2"]).toBe(true); // Backlog overrides
      expect(membership.isBacklogMap["EPM-4"]).toBe(true);
    });

    it("handles board without backlog gracefully", async () => {
      const mockClient = {
        getBoardIssues: vi.fn().mockResolvedValueOnce({
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [{ id: "1", key: "KAN-1", fields: {} }],
        }),
        getBoardBacklog: vi.fn().mockRejectedValue(new JiraRequestError("Backlog not supported", 400, false)),
      };

      const membership = await getBoardMembership(mockClient as any, 202, "user1");
      expect(membership.boardKeys).toEqual(["KAN-1"]);
      expect(membership.backlogKeys).toEqual([]);
      expect(membership.allKeys).toEqual(["KAN-1"]);
      expect(membership.isBacklogMap["KAN-1"]).toBe(false);
    });

    it("coalesces concurrent requests and caches membership", async () => {
      const getBoardIssues = vi.fn().mockResolvedValue({
        startAt: 0,
        maxResults: 100,
        total: 1,
        issues: [{ id: "1", key: "EPM-10", fields: {} }],
      });
      const getBoardBacklog = vi.fn().mockResolvedValue({
        startAt: 0,
        maxResults: 100,
        total: 0,
        issues: [],
      });

      const mockClient = { getBoardIssues, getBoardBacklog };

      const [res1, res2] = await Promise.all([
        getBoardMembership(mockClient as any, 303, "user1"),
        getBoardMembership(mockClient as any, 303, "user1"),
      ]);

      expect(res1.allKeys).toEqual(["EPM-10"]);
      expect(res2.allKeys).toEqual(["EPM-10"]);
      expect(getBoardIssues).toHaveBeenCalledTimes(1);

      // Third call should hit cache directly
      const res3 = await getBoardMembership(mockClient as any, 303, "user1");
      expect(res3.allKeys).toEqual(["EPM-10"]);
      expect(getBoardIssues).toHaveBeenCalledTimes(1);
    });

    it("does not serve stale cache when Jira returns 403 permission denied", async () => {
      const getBoardIssues = vi.fn()
        .mockResolvedValueOnce({
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [{ id: "1", key: "SEC-1", fields: {} }],
        })
        .mockRejectedValue(new JiraRequestError("Forbidden", 403, false));

      const mockClient = {
        getBoardIssues,
        getBoardBacklog: vi.fn().mockResolvedValue({ startAt: 0, maxResults: 100, total: 0, issues: [] }),
      };

      // First call succeeds and caches
      const first = await getBoardMembership(mockClient as any, 404, "userA");
      expect(first.allKeys).toEqual(["SEC-1"]);

      // Invalidate cache TTL to simulate expiry within stale window
      clearBoardMembershipCache();

      // Second call fails with 403: must throw, never serve stale cache
      await expect(getBoardMembership(mockClient as any, 404, "userA")).rejects.toThrowError(
        /Forbidden/
      );
    });
  });
});
