import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BULK_OPERATION_STATES,
  TERMINAL_OPERATION_STATES,
  isTerminalOperationState,
  isValidOperationTransition,
  assertValidOperationTransition,
  InvalidOperationTransitionError,
  createPreviewBulkOperation,
  findBulkOperationById,
  confirmBulkOperation,
  cancelBulkOperation,
  claimBulkOperation,
  findPendingBulkOperationItems,
  findBulkOperationItemById,
  markBulkOperationItemRunning,
  recordBulkOperationItemResult,
  finalizeBulkOperation,
  resetFailedItemsForRetry,
  requeueBulkOperationForRetry,
  type BulkRepositoryClient,
} from "./repository";

describe("Bulk Operation Repository (Batch 4.3)", () => {
  describe("State machine and transition validation", () => {
    it("defines the expected complete state space and terminal states", () => {
      expect(BULK_OPERATION_STATES).toEqual([
        "preview",
        "queued",
        "running",
        "completed",
        "partially_failed",
        "failed",
        "cancelled",
      ]);

      expect(TERMINAL_OPERATION_STATES).toEqual([
        "completed",
        "partially_failed",
        "failed",
        "cancelled",
      ]);

      expect(isTerminalOperationState("completed")).toBe(true);
      expect(isTerminalOperationState("partially_failed")).toBe(true);
      expect(isTerminalOperationState("failed")).toBe(true);
      expect(isTerminalOperationState("cancelled")).toBe(true);
      expect(isTerminalOperationState("preview")).toBe(false);
      expect(isTerminalOperationState("queued")).toBe(false);
      expect(isTerminalOperationState("running")).toBe(false);
    });

    it("permits valid transitions and rejects invalid transitions", () => {
      // Valid transitions
      expect(isValidOperationTransition("preview", "queued")).toBe(true);
      expect(isValidOperationTransition("preview", "cancelled")).toBe(true);
      expect(isValidOperationTransition("queued", "running")).toBe(true);
      expect(isValidOperationTransition("running", "completed")).toBe(true);
      expect(isValidOperationTransition("running", "partially_failed")).toBe(true);
      expect(isValidOperationTransition("running", "failed")).toBe(true);
      expect(isValidOperationTransition("completed", "queued")).toBe(true); // retry
      expect(isValidOperationTransition("partially_failed", "queued")).toBe(true); // retry
      expect(isValidOperationTransition("failed", "queued")).toBe(true); // retry

      // Invalid transitions
      expect(isValidOperationTransition("preview", "running")).toBe(false);
      expect(isValidOperationTransition("preview", "completed")).toBe(false);
      expect(isValidOperationTransition("queued", "completed")).toBe(false);
      expect(isValidOperationTransition("running", "queued")).toBe(false);
      expect(isValidOperationTransition("cancelled", "running")).toBe(false);
      expect(isValidOperationTransition("cancelled", "queued")).toBe(false);
      expect(isValidOperationTransition("completed", "running")).toBe(false);
    });

    it("assertValidOperationTransition throws InvalidOperationTransitionError", () => {
      expect(() => assertValidOperationTransition("preview", "queued")).not.toThrow();
      expect(() => assertValidOperationTransition("preview", "running")).toThrow(
        InvalidOperationTransitionError
      );
      expect(() => assertValidOperationTransition("preview", "running")).toThrow(
        /Invalid bulk operation transition from "preview" to "running"/
      );
    });
  });

  describe("Repository operations with client injection", () => {
    let mockClient: BulkRepositoryClient;

    beforeEach(() => {
      mockClient = {
        bulkOperation: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
        bulkOperationItem: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          createMany: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          groupBy: vi.fn(),
        },
      };
    });

    describe("createPreviewBulkOperation", () => {
      it("creates a preview operation and inserts items", async () => {
        const fakeOp = {
          id: "op-123",
          type: "assign",
          requestedBy: "user-1",
          state: "preview",
          total: 2,
        };
        vi.mocked(mockClient.bulkOperation.create).mockResolvedValue(fakeOp as never);
        vi.mocked(mockClient.bulkOperationItem.createMany).mockResolvedValue({ count: 2 } as never);

        const res = await createPreviewBulkOperation(
          {
            type: "assign",
            requestedBy: "user-1",
            payload: { action: { kind: "assign", value: "dev1" } },
            total: 2,
            items: [
              {
                jiraKey: "PROJ-1",
                before: { assignee: "dev0" },
                after: { assignee: "dev1" },
                requested: { transitionName: null },
                status: "pending",
                error: null,
              },
              {
                jiraKey: "PROJ-2",
                before: {},
                after: {},
                requested: { warning: "not_in_cache" },
                status: "skipped",
                error: "not_in_cache",
              },
            ],
          },
          mockClient
        );

        expect(res).toEqual(fakeOp);
        expect(mockClient.bulkOperation.create).toHaveBeenCalledWith({
          data: {
            type: "assign",
            requestedBy: "user-1",
            payload: { action: { kind: "assign", value: "dev1" } },
            state: "preview",
            total: 2,
          },
        });
        expect(mockClient.bulkOperationItem.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              operationId: "op-123",
              jiraKey: "PROJ-1",
              status: "pending",
              error: null,
            }),
            expect.objectContaining({
              operationId: "op-123",
              jiraKey: "PROJ-2",
              status: "skipped",
              error: "not_in_cache",
            }),
          ],
        });
      });
    });

    describe("findBulkOperationById & items", () => {
      it("fetches operation by id", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({ id: "op-1" } as never);
        const op = await findBulkOperationById("op-1", mockClient);
        expect(op?.id).toBe("op-1");
        expect(mockClient.bulkOperation.findUnique).toHaveBeenCalledWith({
          where: { id: "op-1" },
        });
      });

      it("fetches pending items in ascending order of jiraKey", async () => {
        vi.mocked(mockClient.bulkOperationItem.findMany).mockResolvedValue([
          { id: "item-1", jiraKey: "A-1", status: "pending" },
          { id: "item-2", jiraKey: "A-2", status: "pending" },
        ] as never);

        const items = await findPendingBulkOperationItems("op-1", mockClient);
        expect(items).toHaveLength(2);
        expect(mockClient.bulkOperationItem.findMany).toHaveBeenCalledWith({
          where: { operationId: "op-1", status: "pending" },
          orderBy: { jiraKey: "asc" },
        });
      });

      it("fetches single item by id", async () => {
        vi.mocked(mockClient.bulkOperationItem.findUnique).mockResolvedValue({
          id: "item-1",
          jiraKey: "PROJ-1",
        } as never);
        const item = await findBulkOperationItemById("item-1", mockClient);
        expect(item?.id).toBe("item-1");
      });
    });

    describe("confirmBulkOperation", () => {
      it("confirms a preview operation and transitions to queued", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          requestedBy: "user-1",
          state: "preview",
          total: 5,
        } as never);
        vi.mocked(mockClient.bulkOperationItem.findMany).mockResolvedValue([
          { status: "pending" },
          { status: "pending" },
          { status: "pending" },
          { status: "skipped" },
          { status: "skipped" },
        ] as never);
        vi.mocked(mockClient.bulkOperation.update).mockResolvedValue({} as never);

        const fixedDate = new Date("2026-10-09T10:00:00Z");
        const res = await confirmBulkOperation("op-1", "user-1", fixedDate, mockClient);

        expect(res).toEqual({
          operationId: "op-1",
          total: 5,
          actionable: 3,
          skipped: 2,
        });
        expect(mockClient.bulkOperation.update).toHaveBeenCalledWith({
          where: { id: "op-1" },
          data: { state: "queued", startedAt: fixedDate },
        });
      });

      it("rejects confirming non-existent operation", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue(null);
        await expect(confirmBulkOperation("op-404", "user-1", new Date(), mockClient)).rejects.toThrow(
          "not_found"
        );
      });

      it("rejects confirming operation owned by another user", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          requestedBy: "another-user",
          state: "preview",
        } as never);
        await expect(confirmBulkOperation("op-1", "user-1", new Date(), mockClient)).rejects.toThrow(
          "not_found"
        );
      });

      it("rejects confirming an operation that is not in preview state", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          requestedBy: "user-1",
          state: "running",
        } as never);
        await expect(confirmBulkOperation("op-1", "user-1", new Date(), mockClient)).rejects.toThrow(
          "already_confirmed"
        );
      });
    });

    describe("cancelBulkOperation", () => {
      it("cancels a preview operation", async () => {
        vi.mocked(mockClient.bulkOperation.updateMany).mockResolvedValue({ count: 1 });
        const res = await cancelBulkOperation("op-1", "user-1", mockClient);
        expect(res).toEqual({ cancelled: true, count: 1 });
        expect(mockClient.bulkOperation.updateMany).toHaveBeenCalledWith({
          where: { id: "op-1", requestedBy: "user-1", state: "preview" },
          data: { state: "cancelled" },
        });
      });

      it("returns cancelled: false if operation not found or not in preview state", async () => {
        vi.mocked(mockClient.bulkOperation.updateMany).mockResolvedValue({ count: 0 });
        const res = await cancelBulkOperation("op-running", "user-1", mockClient);
        expect(res).toEqual({ cancelled: false, count: 0 });
      });
    });

    describe("claimBulkOperation & concurrent claiming", () => {
      it("successfully claims a queued operation", async () => {
        const queuedOp = {
          id: "op-1",
          state: "queued",
          startedAt: null,
        };
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue(queuedOp as never);
        vi.mocked(mockClient.bulkOperation.updateMany).mockResolvedValue({ count: 1 });

        const now = new Date("2026-10-09T10:05:00Z");
        const res = await claimBulkOperation("op-1", now, mockClient);

        expect(res.claimed).toBe(true);
        if (res.claimed) {
          expect(res.operation.state).toBe("running");
          expect(res.operation.startedAt).toEqual(now);
        }
        expect(mockClient.bulkOperation.updateMany).toHaveBeenCalledWith({
          where: { id: "op-1", state: "queued" },
          data: { state: "running", startedAt: now },
        });
      });

      it("rejects claiming non-existent operation", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue(null);
        const res = await claimBulkOperation("op-404", new Date(), mockClient);
        expect(res).toEqual({ claimed: false, operation: null, reason: "not_found" });
        expect(mockClient.bulkOperation.updateMany).not.toHaveBeenCalled();
      });

      it("rejects claiming a preview operation (not yet confirmed)", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-prev",
          state: "preview",
        } as never);
        const res = await claimBulkOperation("op-prev", new Date(), mockClient);
        expect(res.claimed).toBe(false);
        if (!res.claimed) {
          expect(res.reason).toBe("not_queued");
        }
        expect(mockClient.bulkOperation.updateMany).not.toHaveBeenCalled();
      });

      it("rejects claiming terminal operation (completed or cancelled)", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-done",
          state: "completed",
        } as never);
        const res = await claimBulkOperation("op-done", new Date(), mockClient);
        expect(res.claimed).toBe(false);
        if (!res.claimed) {
          expect(res.reason).toBe("terminal");
        }
        expect(mockClient.bulkOperation.updateMany).not.toHaveBeenCalled();
      });

      it("rejects claiming an operation already running", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-running",
          state: "running",
        } as never);
        const res = await claimBulkOperation("op-running", new Date(), mockClient);
        expect(res.claimed).toBe(false);
        if (!res.claimed) {
          expect(res.reason).toBe("not_queued");
        }
        expect(mockClient.bulkOperation.updateMany).not.toHaveBeenCalled();
      });

      it("simulates atomic race between two concurrent claimers: only one succeeds", async () => {
        const queuedOp = { id: "op-race", state: "queued", startedAt: null };
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue(queuedOp as never);

        // First caller wins atomic update (count: 1), second loses (count: 0)
        let callCount = 0;
        (
          vi.mocked(mockClient.bulkOperation.updateMany) as unknown as ReturnType<typeof vi.fn>
        ).mockImplementation(async () => {
          callCount++;
          return callCount === 1 ? { count: 1 } : { count: 0 };
        });

        const [claim1, claim2] = await Promise.all([
          claimBulkOperation("op-race", new Date(), mockClient),
          claimBulkOperation("op-race", new Date(), mockClient),
        ]);

        expect(claim1.claimed).toBe(true);
        expect(claim2.claimed).toBe(false);
        if (!claim2.claimed) {
          expect(claim2.reason).toBe("conflict");
        }
      });
    });

    describe("Item execution tracking", () => {
      it("marks item running", async () => {
        await markBulkOperationItemRunning("item-1", mockClient);
        expect(mockClient.bulkOperationItem.update).toHaveBeenCalledWith({
          where: { id: "item-1" },
          data: { status: "running" },
        });
      });

      it("records successful item result with after snapshot", async () => {
        await recordBulkOperationItemResult(
          "item-1",
          {
            status: "succeeded",
            error: null,
            retryable: false,
            attempts: 1,
            after: { status: "Done" },
          },
          mockClient
        );

        expect(mockClient.bulkOperationItem.update).toHaveBeenCalledWith({
          where: { id: "item-1" },
          data: {
            status: "succeeded",
            error: null,
            retryable: false,
            attemptCount: { increment: 1 },
            after: { status: "Done" },
          },
        });
      });

      it("records failed retryable item result", async () => {
        await recordBulkOperationItemResult(
          "item-2",
          {
            status: "failed",
            error: "Connection timeout",
            retryable: true,
            attempts: 3,
          },
          mockClient
        );

        expect(mockClient.bulkOperationItem.update).toHaveBeenCalledWith({
          where: { id: "item-2" },
          data: {
            status: "failed",
            error: "Connection timeout",
            retryable: true,
            attemptCount: { increment: 3 },
            after: undefined,
          },
        });
      });
    });

    describe("finalizeBulkOperation", () => {
      it("marks operation completed when all items succeeded", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          state: "running",
        } as never);
        vi.mocked(mockClient.bulkOperationItem.groupBy).mockResolvedValue([
          { status: "succeeded", _count: { _all: 3 } },
          { status: "skipped", _count: { _all: 1 } },
        ] as never);

        const now = new Date("2026-10-09T10:10:00Z");
        const res = await finalizeBulkOperation("op-1", now, mockClient);

        expect(res).toEqual({
          operationId: "op-1",
          state: "completed",
          succeeded: 3,
          failed: 0,
          skipped: 1,
          stillPending: 0,
          terminal: true,
        });
        expect(mockClient.bulkOperation.update).toHaveBeenCalledWith({
          where: { id: "op-1" },
          data: {
            state: "completed",
            succeeded: 3,
            failed: 0,
            completedAt: now,
          },
        });
      });

      it("marks operation partially_failed when some items failed", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          state: "running",
        } as never);
        vi.mocked(mockClient.bulkOperationItem.groupBy).mockResolvedValue([
          { status: "succeeded", _count: { _all: 2 } },
          { status: "failed", _count: { _all: 1 } },
        ] as never);

        const now = new Date("2026-10-09T10:10:00Z");
        const res = await finalizeBulkOperation("op-1", now, mockClient);

        expect(res).toEqual({
          operationId: "op-1",
          state: "partially_failed",
          succeeded: 2,
          failed: 1,
          skipped: 0,
          stillPending: 0,
          terminal: true,
        });
        expect(mockClient.bulkOperation.update).toHaveBeenCalledWith({
          where: { id: "op-1" },
          data: {
            state: "partially_failed",
            succeeded: 2,
            failed: 1,
            completedAt: now,
          },
        });
      });

      it("does not mark terminal if items are still pending or running", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          state: "running",
        } as never);
        vi.mocked(mockClient.bulkOperationItem.groupBy).mockResolvedValue([
          { status: "succeeded", _count: { _all: 1 } },
          { status: "pending", _count: { _all: 2 } },
        ] as never);

        const res = await finalizeBulkOperation("op-1", new Date(), mockClient);

        expect(res?.terminal).toBe(false);
        expect(res?.state).toBe("running");
        expect(mockClient.bulkOperation.update).toHaveBeenCalledWith({
          where: { id: "op-1" },
          data: {
            state: "running",
            succeeded: 1,
            failed: 0,
            completedAt: undefined,
          },
        });
      });
    });

    describe("Retry helpers", () => {
      it("resets retryable failed items to pending", async () => {
        vi.mocked(mockClient.bulkOperationItem.updateMany).mockResolvedValue({ count: 3 });

        const count = await resetFailedItemsForRetry("op-1", undefined, mockClient);
        expect(count).toBe(3);
        expect(mockClient.bulkOperationItem.updateMany).toHaveBeenCalledWith({
          where: { operationId: "op-1", status: "failed", retryable: true },
          data: { status: "pending", error: null, retryable: true },
        });
      });

      it("requeues operation for retry with valid transition", async () => {
        vi.mocked(mockClient.bulkOperation.findUnique).mockResolvedValue({
          id: "op-1",
          state: "partially_failed",
        } as never);
        const now = new Date("2026-10-09T10:15:00Z");

        await requeueBulkOperationForRetry("op-1", now, mockClient);
        expect(mockClient.bulkOperation.update).toHaveBeenCalledWith({
          where: { id: "op-1" },
          data: { state: "queued", completedAt: null, startedAt: now },
        });
      });
    });
  });
});
