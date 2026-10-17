import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkOperationFindUnique: vi.fn(),
  sentryUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkOperation: { findUnique: mocks.bulkOperationFindUnique },
    sentryIssueImported: { updateMany: mocks.sentryUpdateMany },
  },
}));

import { markSentryRowFromBulkOp } from "./bulk-completion";

const OPEN_STATES = { in: ["review", "pending", "rejected"] };

function op(source: unknown, createItems: unknown[]) {
  return { id: "op-1", payload: { projectKey: "ABC", source }, createItems };
}

describe("markSentryRowFromBulkOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sentryUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("marks the sentry row created when the item succeeded", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue(
      op({ type: "sentry", sentryImportId: "r1" }, [
        { status: "succeeded", jiraKey: "ABC-1", error: null, errorCode: null },
      ])
    );

    await markSentryRowFromBulkOp("op-1");

    expect(mocks.sentryUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.sentryUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", state: OPEN_STATES },
      data: { state: "created", jiraKey: "ABC-1", importedAt: expect.any(Date), lastError: null },
    });
  });

  it("records lastError without changing state when the item failed", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue(
      op({ type: "sentry", sentryImportId: "r1" }, [
        { status: "failed", jiraKey: null, error: "boom", errorCode: "JIRA_ERROR" },
      ])
    );

    await markSentryRowFromBulkOp("op-1");

    expect(mocks.sentryUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.sentryUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", state: OPEN_STATES },
      data: { lastError: "boom" },
    });
  });

  it("does nothing for non-sentry sources", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue(
      op({ type: "grid", fileName: null }, [
        { status: "succeeded", jiraKey: "ABC-1", error: null, errorCode: null },
      ])
    );

    await markSentryRowFromBulkOp("op-1");

    expect(mocks.sentryUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the operation is missing or items are still active", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValueOnce(null);
    await markSentryRowFromBulkOp("op-missing");

    mocks.bulkOperationFindUnique.mockResolvedValueOnce(
      op({ type: "sentry", sentryImportId: "r1" }, [
        { status: "pending", jiraKey: null, error: null, errorCode: null },
      ])
    );
    await markSentryRowFromBulkOp("op-1");

    expect(mocks.sentryUpdateMany).not.toHaveBeenCalled();
  });
});
