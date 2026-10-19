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
  userFindMany: vi.fn(),
  userJiraAuth: vi.fn(),
  notifyUser: vi.fn(),
  audit: vi.fn(),
  processCreateItem: vi.fn(),
  unlockChildren: vi.fn(),
  blockChildren: vi.fn(),
  blockOrphanWaitingItems: vi.fn(),
  recordExecutionMetrics: vi.fn(),
  getIssue: vi.fn(),
  upsertJiraIssue: vi.fn(),
  markSentryRowFromBulkOp: vi.fn(),
  sentryFindUnique: vi.fn(),
  sentryFindMany: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
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
      findMany: mocks.userFindMany,
    },
    sentryIssueImported: {
      findUnique: mocks.sentryFindUnique,
      findMany: mocks.sentryFindMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: mocks.loggerError },
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
  jiraUsernameAliases: (u: string) => [u],
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

vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ getIssue: mocks.getIssue }),
}));

vi.mock("@/lib/issues/cache", () => ({
  upsertJiraIssue: mocks.upsertJiraIssue,
}));

vi.mock("@/lib/sentry/bulk-completion", () => ({
  markSentryRowFromBulkOp: mocks.markSentryRowFromBulkOp,
}));

import {
  executeBulkCreateOperation,
  notifyCreateResult,
  notifyBulkCreateAssignees,
} from "./create-execution";

describe("create-execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sentryFindUnique.mockResolvedValue({ state: "review", jiraKey: null });
    mocks.sentryFindMany.mockResolvedValue([{ id: "r1", state: "review", jiraKey: null }]);
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

    it("marks the sentry row on completion without a second cache sync (item executor refreshes it)", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-cache",
        requestedBy: "user-1",
        state: "queued",
        total: 1,
        payload: { projectKey: "PROJ", source: { type: "sentry", sentryImportId: "r1" } },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });
      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([{ id: "item-1", rowIndex: 0, clientRef: "single-1", status: "pending" }])
        .mockResolvedValueOnce([]);
      mocks.processCreateItem.mockResolvedValueOnce(true);
      mocks.bulkCreateItemFindUnique.mockResolvedValue({ id: "item-1", jiraKey: "PROJ-7", clientRef: "single-1" });
      mocks.bulkCreateItemGroupBy.mockResolvedValue([{ status: "succeeded", _count: { _all: 1 } }]);

      await executeBulkCreateOperation("op-cache");

      expect(mocks.getIssue).not.toHaveBeenCalled();
      expect(mocks.upsertJiraIssue).not.toHaveBeenCalled();
      expect(mocks.processCreateItem).toHaveBeenCalledTimes(1);
      expect(mocks.markSentryRowFromBulkOp).toHaveBeenCalledWith("op-cache");
    });

    it("does not fail the operation when sentry marking throws, and logs the error", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-cache-fail",
        requestedBy: "user-1",
        state: "queued",
        total: 1,
        payload: { projectKey: "PROJ" },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });
      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([{ id: "item-1", rowIndex: 0, clientRef: "row-1", status: "pending" }])
        .mockResolvedValueOnce([]);
      mocks.processCreateItem.mockResolvedValueOnce(true);
      mocks.bulkCreateItemFindUnique.mockResolvedValue({ id: "item-1", jiraKey: "PROJ-8", clientRef: "row-1" });
      mocks.bulkCreateItemGroupBy.mockResolvedValue([{ status: "succeeded", _count: { _all: 1 } }]);
      mocks.getIssue.mockRejectedValue(new Error("jira down"));
      mocks.markSentryRowFromBulkOp.mockRejectedValue(new Error("db down"));

      await expect(executeBulkCreateOperation("op-cache-fail")).resolves.toBeUndefined();

      expect(mocks.upsertJiraIssue).not.toHaveBeenCalled();
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "op-cache-fail" },
          data: expect.objectContaining({ state: "completed", succeeded: 1 }),
        })
      );
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "bulk.create.completed", target: "op-cache-fail" })
      );
      expect(mocks.loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: "op-cache-fail", error: "db down" })
      );
    });

    it.each([
      ["approved for the sentry-import worker", { state: "approved", jiraKey: null }],
      ["already created", { state: "created", jiraKey: "PROJ-1" }],
      ["still open but already linked", { state: "review", jiraKey: "PROJ-2" }],
    ])("cancels a Sentry op without creating when the row is %s", async (_label, sentryRow) => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-sentry-dup",
        requestedBy: "user-1",
        state: "queued",
        total: 1,
        payload: { projectKey: "PROJ", source: { type: "sentry", sentryImportId: "r1" } },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.sentryFindMany.mockResolvedValue([{ id: "r1", ...sentryRow }]);
      mocks.bulkCreateItemFindMany.mockResolvedValue([{ id: "item-1", clientRef: "single-1" }]);

      await executeBulkCreateOperation("op-sentry-dup");

      expect(mocks.sentryFindMany).toHaveBeenCalledWith({
        where: { id: { in: ["r1"] } },
        select: { id: true, state: true, jiraKey: true },
      });
      expect(mocks.processCreateItem).not.toHaveBeenCalled();
      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["item-1"] } },
        data: expect.objectContaining({
          status: "failed",
          errorCode: "SENTRY_ALREADY_FILED",
          error: "Lỗi Sentry đã được tạo task ở luồng khác",
          retryable: false,
        }),
      });
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith({
        where: { id: "op-sentry-dup" },
        data: expect.objectContaining({ state: "cancelled", failed: 1 }),
      });
      expect(mocks.markSentryRowFromBulkOp).not.toHaveBeenCalled();
    });

    it("multi-row Sentry op: only fails the item whose row is already filed, continuing other items", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-sentry-multi",
        requestedBy: "user-1",
        state: "queued",
        total: 2,
        payload: {
          projectKey: "PROJ",
          source: { type: "sentry", sentryImportIds: ["r1", "r2"] },
        },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });
      // r1 was already created; r2 is still open
      mocks.sentryFindMany.mockResolvedValue([
        { id: "r1", state: "created", jiraKey: "PROJ-1" },
        { id: "r2", state: "review", jiraKey: null },
      ]);
      // First findMany call for taken items:
      mocks.bulkCreateItemFindMany
        .mockResolvedValueOnce([
          { id: "item-1", clientRef: "sentry-r1" },
          { id: "item-2", clientRef: "sentry-r2" },
        ])
        // Round 1 items to execute:
        .mockResolvedValueOnce([
          { id: "item-2", rowIndex: 1, clientRef: "sentry-r2", status: "pending" },
        ])
        // Round 2 items (done):
        .mockResolvedValueOnce([]);

      mocks.processCreateItem.mockResolvedValueOnce(true);
      mocks.bulkCreateItemFindUnique.mockResolvedValue({ id: "item-2", jiraKey: "PROJ-2", clientRef: "sentry-r2" });
      mocks.bulkCreateItemGroupBy.mockResolvedValue([
        { status: "failed", _count: { _all: 1 } },
        { status: "succeeded", _count: { _all: 1 } },
      ]);

      await executeBulkCreateOperation("op-sentry-multi");

      // Item 1 was marked failed
      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["item-1"] } },
        data: expect.objectContaining({
          status: "failed",
          errorCode: "SENTRY_ALREADY_FILED",
        }),
      });

      // Item 2 proceeded to execution
      expect(mocks.processCreateItem).toHaveBeenCalledTimes(1);
      expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "op-sentry-multi" },
          data: expect.objectContaining({ state: "partially_failed", succeeded: 1, failed: 1 }),
        })
      );
      expect(mocks.markSentryRowFromBulkOp).toHaveBeenCalledWith("op-sentry-multi");
    });

    it("does not look up a Sentry row for non-Sentry ops", async () => {
      mocks.bulkOperationFindUnique.mockResolvedValue({
        id: "op-plain",
        requestedBy: "user-1",
        state: "queued",
        total: 0,
        payload: { projectKey: "PROJ", source: { type: "grid" } },
        createItems: [],
      });
      mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
      mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
      mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-1", authMode: "Bearer" });
      mocks.bulkCreateItemFindMany.mockResolvedValueOnce([]);
      mocks.bulkCreateItemGroupBy.mockResolvedValue([]);

      await executeBulkCreateOperation("op-plain");

      expect(mocks.sentryFindUnique).not.toHaveBeenCalled();
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

  describe("notifyBulkCreateAssignees", () => {
    it("aggregates multiple tasks assigned to the same user into a single notification", async () => {
      mocks.bulkCreateItemFindMany.mockResolvedValue([
        { jiraKey: "EPM-1", requested: { summary: "Task 1", assignee: "bob" } },
        { jiraKey: "EPM-2", requested: { summary: "Task 2", assignee: "bob" } },
        { jiraKey: "EPM-3", requested: { summary: "Task 3", assignee: "bob" } },
      ]);
      mocks.userFindUnique.mockResolvedValue({ displayName: "Admin User", jiraUsername: "admin" });
      mocks.userFindMany.mockResolvedValue([{ id: "bob-user-id" }]);

      await notifyBulkCreateAssignees({ requestedBy: "admin-user-id", id: "op-1" }, "EPM");

      expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "bob-user-id",
        expect.objectContaining({
          type: "issue",
          title: "Bạn được gán 3 task mới (EPM)",
          body: expect.stringContaining("Admin User đã tạo và gán 3 task cho bạn: EPM-1, EPM-2, EPM-3."),
          link: "/bulk?operation=op-1",
        })
      );
    });

    it("sends single-task format when only 1 task is assigned to a user", async () => {
      mocks.bulkCreateItemFindMany.mockResolvedValue([
        { jiraKey: "EPM-10", requested: { summary: "Single Task", assignee: "charlie" } },
      ]);
      mocks.userFindUnique.mockResolvedValue({ displayName: "Admin User" });
      mocks.userFindMany.mockResolvedValue([{ id: "charlie-user-id" }]);

      await notifyBulkCreateAssignees({ requestedBy: "admin-user-id", id: "op-2" }, "EPM");

      expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
      expect(mocks.notifyUser).toHaveBeenCalledWith(
        "charlie-user-id",
        expect.objectContaining({
          type: "issue",
          title: "Bạn được gán task EPM-10",
          body: expect.stringContaining('Admin User đã tạo và gán task "Single Task" cho bạn.'),
          link: "/issue/EPM-10",
        })
      );
    });

    it("skips notification when task is assigned to the creator themselves", async () => {
      mocks.bulkCreateItemFindMany.mockResolvedValue([
        { jiraKey: "EPM-20", requested: { summary: "Self Task", assignee: "admin" } },
      ]);
      mocks.userFindUnique.mockResolvedValue({ displayName: "Admin", jiraUsername: "admin" });
      mocks.userFindMany.mockResolvedValue([{ id: "admin-user-id" }]);

      await notifyBulkCreateAssignees({ requestedBy: "admin-user-id", id: "op-3" }, "EPM");

      expect(mocks.notifyUser).not.toHaveBeenCalled();
    });
  });
});

