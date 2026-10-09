import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkCreateItemFindFirst: vi.fn(),
  bulkCreateItemUpdate: vi.fn(),
  bulkCreateItemUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkCreateItem: {
      findFirst: mocks.bulkCreateItemFindFirst,
      update: mocks.bulkCreateItemUpdate,
      updateMany: mocks.bulkCreateItemUpdateMany,
    },
  },
}));

import {
  resolveItemParentKey,
  unlockChildren,
  blockChildren,
  blockOrphanWaitingItems,
} from "./create-parent-resolver";

describe("create-parent-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveItemParentKey", () => {
    it("returns existing Jira key directly when parentJiraKey is provided", async () => {
      const result = await resolveItemParentKey("op-1", "item-1", {
        parentJiraKey: "PROJ-100",
      });

      expect(result).toEqual({
        resolvedParentKey: "PROJ-100",
        blocked: false,
      });
      expect(mocks.bulkCreateItemFindFirst).not.toHaveBeenCalled();
      expect(mocks.bulkCreateItemUpdate).not.toHaveBeenCalled();
    });

    it("resolves parent Jira key from batch parent when parent succeeded", async () => {
      mocks.bulkCreateItemFindFirst.mockResolvedValue({
        jiraKey: "PROJ-200",
        status: "succeeded",
      });

      const result = await resolveItemParentKey("op-1", "item-child", {
        parentClientRef: "client-parent",
      });

      expect(result).toEqual({
        resolvedParentKey: "PROJ-200",
        blocked: false,
      });
      expect(mocks.bulkCreateItemFindFirst).toHaveBeenCalledWith({
        where: { operationId: "op-1", clientRef: "client-parent" },
        select: { jiraKey: true, status: true },
      });
      expect(mocks.bulkCreateItemUpdate).not.toHaveBeenCalled();
    });

    it("blocks child item when batch parent has not been created yet or has no jiraKey", async () => {
      mocks.bulkCreateItemFindFirst.mockResolvedValue({
        jiraKey: null,
        status: "failed",
      });

      const result = await resolveItemParentKey("op-1", "item-child", {
        parentClientRef: "client-parent",
      });

      expect(result).toEqual({
        resolvedParentKey: null,
        blocked: true,
        error: 'Parent "client-parent" chưa được tạo',
        errorCode: "PARENT_BLOCKED",
      });
      expect(mocks.bulkCreateItemUpdate).toHaveBeenCalledWith({
        where: { id: "item-child" },
        data: {
          status: "blocked_by_parent",
          error: 'Parent "client-parent" chưa được tạo',
          errorCode: "PARENT_BLOCKED",
        },
      });
    });

    it("blocks child item when batch parent is not found in database", async () => {
      mocks.bulkCreateItemFindFirst.mockResolvedValue(null);

      const result = await resolveItemParentKey("op-1", "item-child", {
        parentClientRef: "client-missing",
      });

      expect(result.blocked).toBe(true);
      expect(result.resolvedParentKey).toBeNull();
      expect(mocks.bulkCreateItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "item-child" },
          data: expect.objectContaining({
            status: "blocked_by_parent",
          }),
        })
      );
    });

    it("returns null resolvedParentKey when neither parentJiraKey nor parentClientRef is provided", async () => {
      const result = await resolveItemParentKey("op-1", "item-root", {});

      expect(result).toEqual({
        resolvedParentKey: null,
        blocked: false,
      });
      expect(mocks.bulkCreateItemFindFirst).not.toHaveBeenCalled();
      expect(mocks.bulkCreateItemUpdate).not.toHaveBeenCalled();
    });
  });

  describe("unlockChildren", () => {
    it("transitions waiting_for_parent to pending with resolvedParentJiraKey", async () => {
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 3 });

      const count = await unlockChildren("op-1", "parent-ref-1", "PROJ-777");

      expect(count).toBe(3);
      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: {
          operationId: "op-1",
          parentClientRef: "parent-ref-1",
          status: "waiting_for_parent",
        },
        data: {
          status: "pending",
          resolvedParentJiraKey: "PROJ-777",
          error: null,
          errorCode: null,
        },
      });
    });
  });

  describe("blockChildren", () => {
    it("transitions waiting_for_parent to blocked_by_parent with error description", async () => {
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 2 });

      const count = await blockChildren("op-1", "parent-ref-1");

      expect(count).toBe(2);
      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: {
          operationId: "op-1",
          parentClientRef: "parent-ref-1",
          status: "waiting_for_parent",
        },
        data: {
          status: "blocked_by_parent",
          error: 'Parent "parent-ref-1" thất bại khi tạo trên Jira',
          errorCode: "PARENT_BLOCKED",
        },
      });
    });
  });

  describe("blockOrphanWaitingItems", () => {
    it("blocks any remaining waiting_for_parent items at the end of execution", async () => {
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 5 });

      const count = await blockOrphanWaitingItems("op-1");

      expect(count).toBe(5);
      expect(mocks.bulkCreateItemUpdateMany).toHaveBeenCalledWith({
        where: {
          operationId: "op-1",
          status: "waiting_for_parent",
        },
        data: {
          status: "blocked_by_parent",
          error: "Parent trong batch không được tạo thành công",
          errorCode: "PARENT_BLOCKED",
        },
      });
    });
  });
});
