import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  startBoss: vi.fn(),
}));

vi.mock("./connection", () => ({
  startBoss: mocks.startBoss,
}));

import {
  enqueueBoardMembershipRefresh,
  enqueueBulkOperation,
  enqueueCheckBranches,
  enqueueJiraDispatch,
  enqueueJiraProjectSync,
  enqueueNotificationDelivery,
  enqueuePollPrComments,
  enqueueWebhookEvent,
} from "./enqueue";

describe("queue enqueue boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startBoss.mockResolvedValue({ send: mocks.send });
    mocks.send.mockResolvedValue("job-123");
  });

  it("preserves a null job id when pg-boss coalesces a singleton", async () => {
    mocks.send.mockResolvedValueOnce(null);

    await expect(enqueueJiraDispatch({ source: "schedule" })).resolves.toBeNull();
  });

  it("propagates a rejected send without converting it to null", async () => {
    const rejection = new Error("queue rejected");
    mocks.send.mockRejectedValueOnce(rejection);

    await expect(enqueueJiraProjectSync({ projectKey: "EPM" })).rejects.toBe(rejection);
  });

  it("propagates a database startup failure before attempting send", async () => {
    const databaseError = new Error("database unavailable");
    mocks.startBoss.mockRejectedValueOnce(databaseError);

    await expect(enqueueBulkOperation("op-1")).rejects.toBe(databaseError);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps webhook, bulk, and manual sync payload/options unchanged", async () => {
    await enqueueWebhookEvent({ source: "jira", eventId: "event-1" });
    await enqueueBulkOperation("op-1");
    await enqueueCheckBranches();
    await enqueuePollPrComments();

    expect(mocks.send).toHaveBeenNthCalledWith(1, "process-webhook", {
      source: "jira",
      eventId: "event-1",
    }, {
      singletonKey: "process-webhook:event-1",
      singletonSeconds: 60,
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
    });
    expect(mocks.send).toHaveBeenNthCalledWith(2, "bulk-op", { operationId: "op-1" }, {
      singletonKey: "bulk-op:op-1",
      singletonSeconds: 3600,
      retryLimit: 1,
      retryDelay: 60,
    });
    expect(mocks.send).toHaveBeenNthCalledWith(3, "check-branches", {}, {
      singletonKey: "check-branches:manual",
      singletonSeconds: 30,
      retryLimit: 1,
      retryDelay: 15,
    });
    expect(mocks.send).toHaveBeenNthCalledWith(4, "poll-pr-comments", {}, {
      singletonKey: "poll-pr-comments:manual",
      singletonSeconds: 30,
      retryLimit: 1,
      retryDelay: 15,
    });
  });

  it("keeps notification scheduling options and return value unchanged", async () => {
    const startAfter = new Date("2026-10-09T03:00:00.000Z");

    await expect(enqueueNotificationDelivery(startAfter)).resolves.toBe("job-123");
    expect(mocks.send).toHaveBeenCalledWith("deliver-notifications", {}, {
      startAfter,
      retryLimit: 3,
      retryDelay: 15,
      retryBackoff: true,
    });
  });

  it("keeps board membership enqueue disabled without opening a connection", async () => {
    await expect(enqueueBoardMembershipRefresh({
      userId: "user-1",
      projectKey: "EPM",
      boardId: 7,
      reason: "manual_retry",
    })).resolves.toBeNull();

    expect(mocks.startBoss).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
