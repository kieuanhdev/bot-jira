import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  resolveProjectBoardConfig,
  isBacklogColumn,
  clearBoardConfigCache,
  type JiraBoardClient,
} from "./board-config";
import { projectBoardIds, boardBacklogColumns, projectColumns } from "@/lib/env";
import { JiraRequestError } from "./client";

describe("board-config", () => {
  beforeEach(() => {
    clearBoardConfigCache();
    // Reset test overrides
    for (const key of Object.keys(projectBoardIds)) delete projectBoardIds[key];
    for (const key of Object.keys(boardBacklogColumns)) delete boardBacklogColumns[key];
    for (const key of Object.keys(projectColumns)) delete projectColumns[key];
  });

  describe("isBacklogColumn", () => {
    it("detects standard 'Backlog' column case-insensitively with spaces", () => {
      expect(isBacklogColumn("Backlog")).toBe(true);
      expect(isBacklogColumn("backlog")).toBe(true);
      expect(isBacklogColumn(" Backlog ")).toBe(true);
      expect(isBacklogColumn("BACKLOG")).toBe(true);
    });

    it("does not detect 'To Do', 'Plan', or other states as Backlog by default", () => {
      expect(isBacklogColumn("To Do")).toBe(false);
      expect(isBacklogColumn("Plan")).toBe(false);
      expect(isBacklogColumn("In Progress")).toBe(false);
      expect(isBacklogColumn("Done")).toBe(false);
    });

    it("supports override by boardId", () => {
      boardBacklogColumns["101"] = "Product Queue";
      expect(isBacklogColumn("Product Queue", 101)).toBe(true);
      expect(isBacklogColumn("Product Queue", 102)).toBe(false);
    });

    it("supports override by projectKey", () => {
      boardBacklogColumns["EPM"] = "Sprint Backlog";
      expect(isBacklogColumn("Sprint Backlog", null, "EPM")).toBe(true);
      expect(isBacklogColumn("Sprint Backlog", null, "MR")).toBe(false);
    });
  });

  describe("resolveProjectBoardConfig", () => {
    it("uses explicit projectBoardIds mapping when present", async () => {
      projectBoardIds["EPM"] = 105;

      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration: vi.fn().mockResolvedValue({
          id: 105,
          name: "EPM Scrum Board",
          type: "scrum",
          columnConfig: {
            columns: [
              { name: "Backlog", statuses: [{ id: "10000" }, { id: "10001" }] },
              { name: "In Progress", statuses: [{ id: "10002" }] },
              { name: "Done", statuses: [{ id: "10003" }] },
            ],
          },
        }),
        getProjectStatuses: vi.fn().mockResolvedValue([
          {
            subtask: false,
            statuses: [
              { id: "10000", name: "Open", statusCategory: { key: "new" } },
              { id: "10001", name: "Reopened", statusCategory: { key: "new" } },
              { id: "10002", name: "In Progress", statusCategory: { key: "indeterminate" } },
              { id: "10003", name: "Closed", statusCategory: { key: "done" } },
            ],
          },
        ]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "EPM");
      expect(res.source).toBe("jira_board");
      expect(res.board?.id).toBe(105);
      expect(res.columns).toHaveLength(3);
      expect(res.columns[0]).toEqual({
        id: "105:0",
        name: "Backlog",
        statusIds: ["10000", "10001"],
        statuses: [
          { id: "10000", name: "Open" },
          { id: "10001", name: "Reopened" },
        ],
        isBacklog: true,
        isDone: false,
      });
      expect(res.columns[2].isDone).toBe(true);
      expect(res.backlogColumnId).toBe("105:0");
      expect(res.backlogStatusIds).toEqual(["10000", "10001"]);
      // When mapping exists, getBoardsForProject should not even be called
      expect(mockClient.getBoardsForProject).not.toHaveBeenCalled();
    });

    it("auto-picks the board when exactly 1 board is returned", async () => {
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn().mockResolvedValue([
          { id: 201, name: "Single Board", type: "kanban" },
        ]),
        getBoardConfiguration: vi.fn().mockResolvedValue({
          id: 201,
          name: "Single Board",
          type: "kanban",
          columnConfig: {
            columns: [
              { name: "To Do", statuses: [{ id: "20001" }] },
              { name: "Done", statuses: [{ id: "20002" }] },
            ],
          },
        }),
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "ETM");
      expect(res.source).toBe("jira_board");
      expect(res.board?.id).toBe(201);
      expect(res.columns).toHaveLength(2);
      expect(res.backlogColumnId).toBeNull(); // No column named Backlog
      expect(res.backlogStatusIds).toEqual([]);
    });

    it("requires board selection when multiple boards are returned without mapping or kanban", async () => {
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn().mockResolvedValue([
          { id: 301, name: "Scrum Board 1", type: "scrum" },
          { id: 302, name: "Scrum Board 2", type: "scrum" },
        ]),
        getBoardConfiguration: vi.fn(),
        getProjectStatuses: vi.fn().mockResolvedValue([
          {
            subtask: false,
            statuses: [
              { id: "30001", name: "Backlog", statusCategory: { key: "new" } },
              { id: "30002", name: "In Progress", statusCategory: { key: "indeterminate" } },
              { id: "30003", name: "Done", statusCategory: { key: "done" } },
            ],
          },
        ]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "MULTI");
      expect(res.source).toBe("workflow");
      expect(res.fallbackReason).toBe("board_selection_required");
      expect(res.candidateBoards).toHaveLength(2);
      expect(res.board).toBeNull();
      expect(mockClient.getBoardConfiguration).not.toHaveBeenCalled();
    });

    it("defaults to kanban board when multiple boards exist without user preference or env config", async () => {
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn().mockResolvedValue([
          { id: 301, name: "Scrum Board", type: "scrum" },
          { id: 302, name: "Kanban Board", type: "kanban" },
        ]),
        getBoardConfiguration: vi.fn().mockResolvedValue({
          id: 302,
          name: "Kanban Board",
          type: "kanban",
          columnConfig: {
            columns: [
              { name: "To Do", statuses: [{ id: "30001" }] },
              { name: "Done", statuses: [{ id: "30002" }] },
            ],
          },
        }),
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "MULTI_KANBAN");
      expect(res.source).toBe("jira_board");
      expect(res.board?.id).toBe(302);
      expect(res.board?.type).toBe("kanban");
      expect(res.selectionSource).toBe("environment_default");
      expect(mockClient.getBoardConfiguration).toHaveBeenCalledWith(302);
    });

    it("falls back to manual or workflow when no boards found", async () => {
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn().mockResolvedValue([]),
        getBoardConfiguration: vi.fn(),
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "NOBOARD");
      expect(res.source).toBe("default");
      expect(res.fallbackReason).toBe("no_boards_found");
      expect(res.columns).toHaveLength(3);
    });

    it("falls back gracefully when user lacks board permissions (403)", async () => {
      projectBoardIds["SECRET"] = 999;
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration: vi.fn().mockRejectedValue(new JiraRequestError("Forbidden", 403, false)),
        getProjectStatuses: vi.fn().mockResolvedValue([
          {
            subtask: false,
            statuses: [
              { id: "90001", name: "Backlog", statusCategory: { key: "new" } },
              { id: "90002", name: "Done", statusCategory: { key: "done" } },
            ],
          },
        ]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "SECRET");
      expect(res.source).toBe("workflow");
      expect(res.fallbackReason).toBe("permission_denied");
      expect(res.columns).toHaveLength(2);
    });

    it("caches resolved configs and coalesces concurrent requests", async () => {
      projectBoardIds["CACHE_TEST"] = 555;
      const getBoardConfiguration = vi.fn().mockResolvedValue({
        id: 555,
        name: "Cached Board",
        type: "scrum",
        columnConfig: {
          columns: [{ name: "Backlog", statuses: [{ id: "55501" }] }],
        },
      });

      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration,
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      // Concurrent calls
      const [res1, res2] = await Promise.all([
        resolveProjectBoardConfig(mockClient, "CACHE_TEST", "userA"),
        resolveProjectBoardConfig(mockClient, "CACHE_TEST", "userA"),
      ]);

      expect(res1.source).toBe("jira_board");
      expect(res2.source).toBe("jira_board");
      expect(getBoardConfiguration).toHaveBeenCalledTimes(1);

      // Third call should hit cache directly
      const res3 = await resolveProjectBoardConfig(mockClient, "CACHE_TEST", "userA");
      expect(res3.board?.id).toBe(555);
      expect(getBoardConfiguration).toHaveBeenCalledTimes(1);
    });

    it("prioritizes preferredBoardId over projectBoardIds and discovery", async () => {
      projectBoardIds["MULTI"] = 100; // environment default

      const getBoardConfiguration = vi.fn().mockImplementation(async (id: number) => ({
        id,
        name: `Board ${id}`,
        type: "scrum",
        columnConfig: {
          columns: [{ name: "Backlog", statuses: [{ id: `${id}01` }] }],
        },
      }));

      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration,
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "MULTI", "user1", 200);
      expect(res.source).toBe("jira_board");
      expect(res.board?.id).toBe(200);
      expect(res.selectedBoardId).toBe(200);
      expect(res.selectionSource).toBe("user_preference");
      expect(getBoardConfiguration).toHaveBeenCalledWith(200);
      expect(mockClient.getBoardsForProject).not.toHaveBeenCalled();
    });

    it("caches configurations separately for different board IDs in same project", async () => {
      const getBoardConfiguration = vi.fn().mockImplementation(async (id: number) => ({
        id,
        name: `Board ${id}`,
        type: id === 101 ? "scrum" : "kanban",
        columnConfig: {
          columns: [{ name: id === 101 ? "Sprint Backlog" : "Kanban Col", statuses: [{ id: `${id}` }] }],
        },
      }));

      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration,
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res1 = await resolveProjectBoardConfig(mockClient, "PROJECT", "user1", 101);
      const res2 = await resolveProjectBoardConfig(mockClient, "PROJECT", "user1", 102);

      expect(res1.board?.id).toBe(101);
      expect(res1.columns[0].name).toBe("Sprint Backlog");

      expect(res2.board?.id).toBe(102);
      expect(res2.columns[0].name).toBe("Kanban Col");

      expect(getBoardConfiguration).toHaveBeenCalledTimes(2);
    });

    it("does not call getBoardsForProject when preferredBoardId is provided", async () => {
      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration: vi.fn().mockResolvedValue({
          id: 777,
          name: "Direct Board",
          type: "kanban",
          columnConfig: { columns: [{ name: "Done", statuses: [] }] },
        }),
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      const res = await resolveProjectBoardConfig(mockClient, "DIRECT", "user1", 777);
      expect(res.board?.id).toBe(777);
      expect(mockClient.getBoardsForProject).not.toHaveBeenCalled();
      expect(mockClient.getBoardConfiguration).toHaveBeenCalledWith(777);
    });

    it("clears in-flight request when rejection occurs so retry works", async () => {
      const getBoardConfiguration = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({
          id: 888,
          name: "Retry Board",
          type: "kanban",
          columnConfig: { columns: [{ name: "Done", statuses: [] }] },
        });

      const mockClient: JiraBoardClient = {
        getBoardsForProject: vi.fn(),
        getBoardConfiguration,
        getProjectStatuses: vi.fn().mockResolvedValue([]),
      };

      // First call fails
      const res1 = await resolveProjectBoardConfig(mockClient, "FAILPRJ", "user1", 888);
      expect(res1.source).toBe("default"); // fallback config

      clearBoardConfigCache();

      // Subsequent call should retry and succeed
      const res2 = await resolveProjectBoardConfig(mockClient, "FAILPRJ", "user1", 888);
      expect(res2.source).toBe("jira_board");
      expect(res2.board?.id).toBe(888);
    });
  });
});
