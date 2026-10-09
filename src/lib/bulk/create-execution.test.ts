import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkOperationFindUnique: vi.fn(),
  bulkOperationUpdateMany: vi.fn(),
  bulkOperationUpdate: vi.fn(),
  bulkCreateItemFindUnique: vi.fn(),
  bulkCreateItemFindMany: vi.fn(),
  bulkCreateItemUpdateMany: vi.fn(),
  bulkCreateItemUpdate: vi.fn(),
  bulkCreateItemGroupBy: vi.fn(),
  userFindUnique: vi.fn(),
  userJiraAuth: vi.fn(),
  notifyUser: vi.fn(),
  audit: vi.fn(),
  processCreateItem: vi.fn(),
  unlockChildren: vi.fn(),
  blockChildren: vi.fn(),
  blockOrphanWaitingItems: vi.fn(),
  recordExecutionMetrics: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkOperation: {
      findUnique: mocks.bulkOperationFindUnique,
      updateMany: mocks.bulkOperationUpdateMany,
      update: mocks.bulkOperationUpdate,
    },
    bulkCreateItem: {
      findUnique: mocks.bulkCreateItemFindUnique,
      findMany: mocks.bulkCreateItemFindMany,
      updateMany: mocks.bulkCreateItemUpdateMany,
      update: mocks.bulkCreateItemUpdate,
      groupBy: mocks.bulkCreateItemGroupBy,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
}));

vi.mock("@/lib/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

vi.mock("./create-metrics", () => ({
  recordExecutionMetrics: mocks.recordExecutionMetrics,
  SLOW_ITEM_THRESHOLD_MS: 3000,
}));

vi.mock("./create-metadata", () => ({
  fetchBulkCreateMetadata: vi.fn().mockResolvedValue({}),
}));

vi.mock("./create-parent-resolver", () => ({
  unlockChildren: mocks.unlockChildren,
  blockChildren: mocks.blockChildren,
  blockOrphanWaitingItems: mocks.blockOrphanWaitingItems,
}));

vi.mock("./create-item-executor", () => ({
  processCreateItem: mocks.processCreateItem,
}));

import {
  executeBulkCreateOperation,
  notifyCreateResult,
} from "./create-execution";

describe("create-execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeBulkCreateOperation", () => {
    it("returns immediately if operation does not exist or is already terminal", async () => {
      // 1. Not found
      mocks.bulkOperationFindUnique.mockResolvedValueOnce(null);
      await executeBulkCreateOperation("op-non-existent");
      expect(mocks.bulkOperationUpdateMany).not.toHaveBeenCalled();

      // 2. Already completed
      mocks.bulkOperationFindUnique.mockResolvedValueOnce({
        id: "op-done",
        state: "completed",
      });
      await executeBulkCreateOperation("op-done");
      expect(mocks.bulkOperationUpdateMany).not.toHaveBeenCalled();
    });

    it("fails operation and all pending/waiting items when Jira credentials are missing", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-no-auth",
        requestedBy: "user-no-token",
        state: "queued",
        total: 2,
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-no-token" });
      mocks.userJiraAuth.mockReturnValue(null); // No auth!

      await executeBulkCreateOperation("op-no-auth");

      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: { operationId: "op-no-auth", status: { in: ["pending", "waiting_for_parent"] } },
        data: expect.objectContaining({
          status: "failed",
          errorCode: "JIRA_CREDENTIALS_REQUIRED",
          retryable: false,
        }),
      });
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith({
        where: { id: "op-no-auth" },
        data: expect.objectContaining({
          state: "failed",
          failed: 2,
        }),
      });
      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "user-no-token",
        expect.objectContaining({
          severity: "danger",
        })
      );
    });

    it("runs multi-round dependency loop: parent succeeds in round 1, unlocks child for round 2", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-multi",
        requestedBy: "user-1",
        state: "queued",
        total: 2,
        payload: { projectKey: "PROJ" },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });

      // Round 1: parent is pending
      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([
          { id: "item-parent", rowIndex: 0, clientRef: "parent-ref", status: "pending" },
        ])
        // Round 2: child is now pending
        .mockResolvedValueOnce([
          { id: "item-child", rowIndex: 1, clientRef: "child-ref", status: "pending" },
        ])
        // Round 3: no more pending items
        .mockResolvedValueOnce([]);

      // Parent succeeds
      mocks.processCreateItem
        .mockResolvedValueOnce(true) // parent
        .mockResolvedValueOnce(true); // child

      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-parent",
        jiraKey: "PROJ-100",
        clientRef: "parent-ref",
      });

      mocks.bulkCreateItemGroupBy.mockResolvedValue([
        { status: "succeeded", _count: { _all: 2 } },
      ]);

      await executeBulkCreateOperation("op-multi");

      expect(mocks.processCreateItem).toHaveBeenCalledTimes(2);
      expect(mocks.unlockChildren).toHaveBeenCalledWith("op-multi", "parent-ref", "PROJ-100");
      expect(mocks.blockOrphanWaitingItems).toHaveBeenCalledWith("op-multi");
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "op-multi" },
          data: expect.objectContaining({
            state: "completed",
            succeeded: 2,
            failed: 0,
          }),
        })
      );
      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          severity: "success",
          title: expect.stringContaining("hoàn tất thành công"),
        })
      );
    });

    it("blocks child when parent fails in round 1", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-fail-dep",
        requestedBy: "user-1",
        state: "queued",
        total: 2,
        payload: { projectKey: "PROJ" },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });

      // Round 1: parent is pending
      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([
          { id: "item-parent", rowIndex: 0, clientRef: "parent-ref", status: "pending" },
        ])
        // Round 2: no more pending items (child was waiting and gets blocked)
        .mockResolvedValueOnce([]);

      // Parent fails
      mocks.processCreateItem.mockResolvedValueOnce(false);

      mocks.bulkCreateItemGroupBy.mockResolvedValue([
        { status: "failed", _count: { _all: 1 } },
        { status: "blocked_by_parent", _count: { _all: 1 } },
      ]);

      await executeBulkCreateOperation("op-fail-dep");

      expect(mocks.blockChildren).toHaveBeenCalledWith("op-fail-dep", "parent-ref");
      expect(mocks.blockOrphanWaitingItems).toHaveBeenCalledWith("op-fail-dep");
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "op-fail-dep" },
          data: expect.objectContaining({
            state: "failed",
            succeeded: 0,
            failed: 1,
          }),
        })
      );
    });

    it("marks partially_failed when some items succeed and others fail", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-partial",
        requestedBy: "user-1",
        state: "queued",
        total: 2,
        payload: { projectKey: "PROJ" },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });

      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([
          { id: "item-1", rowIndex: 0, clientRef: "ref-1", status: "pending" },
          { id: "item-2", rowIndex: 1, clientRef: "ref-2", status: "pending" },
        ])
        .mockResolvedValueOnce([]);

      mocks.processCreateItem
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-1",
        jiraKey: "PROJ-101",
        clientRef: "ref-1",
      });

      mocks.bulkCreateItemGroupBy.mockResolvedValue([
        { status: "succeeded", _count: { _all: 1 } },
        { status: "failed", _count: { _all: 1 } },
      ]);

      await executeBulkCreateOperation("op-partial");

      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "op-partial" },
          data: expect.objectContaining({
            state: "partially_failed",
            succeeded: 1,
            failed: 1,
          }),
        })
      );
      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          severity: "warning",
          title: expect.stringContaining("thất bại một phần"),
        })
      );
    });
  });

  describe("notifyCreateResult", () => {
    it("notifies with warning severity for partially_failed", async () => {
      await notifyCreateResult({ requestedBy: "user-2", id: "op-2" }, "partially_failed", 5, 2);

      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "user-2",
        expect.objectContaining({
          title: "Tạo task hàng loạt thất bại một phần",
          body: "5 task đã tạo thành công, 2 task lỗi.",
          severity: "warning",
        })
      );
    });

    it("gracefully catches and ignores notification errors", async () => {
      mocks.notifyUser.mockRejectedValueOnce(new Error("Network failure"));

      await expect(
        notifyCreateResult({ requestedBy: "user-2", id: "op-2" }, "completed", 5, 0)
      ).resolves.not.toThrow();
    });
  });
});
