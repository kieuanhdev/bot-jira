import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isOperationRetryable,
  isItemRetryable,
  calculateRetryBackoff,
  isErrorRetryable,
  processWithRetry,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  type ProcessWithRetryDeps,
} from "./retry";
import type { OpAuth } from "./executors";

describe("Bulk Retry Policy, Classifier & Execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isOperationRetryable", () => {
    it("permits retry for terminal non-cancelled operation states", () => {
      expect(isOperationRetryable("completed")).toBe(true);
      expect(isOperationRetryable("partially_failed")).toBe(true);
      expect(isOperationRetryable("failed")).toBe(true);
    });

    it("rejects retry for non-terminal or cancelled states", () => {
      expect(isOperationRetryable("preview")).toBe(false);
      expect(isOperationRetryable("queued")).toBe(false);
      expect(isOperationRetryable("running")).toBe(false);
      expect(isOperationRetryable("cancelled")).toBe(false);
      expect(isOperationRetryable("invalid")).toBe(false);
    });
  });

  describe("isItemRetryable", () => {
    it("only returns true for failed items flagged as retryable", () => {
      expect(isItemRetryable({ status: "failed", retryable: true })).toBe(true);
    });

    it("never returns true for succeeded items (idempotency guard)", () => {
      expect(isItemRetryable({ status: "succeeded", retryable: true })).toBe(false);
      expect(isItemRetryable({ status: "succeeded", retryable: false })).toBe(false);
    });

    it("rejects failed items that are marked non-retryable", () => {
      expect(isItemRetryable({ status: "failed", retryable: false })).toBe(false);
      expect(isItemRetryable({ status: "failed", retryable: null })).toBe(false);
      expect(isItemRetryable({ status: "failed" })).toBe(false);
    });

    it("rejects skipped or pending items", () => {
      expect(isItemRetryable({ status: "skipped", retryable: true })).toBe(false);
      expect(isItemRetryable({ status: "pending", retryable: true })).toBe(false);
    });
  });

  describe("calculateRetryBackoff", () => {
    it("calculates linear backoff delay based on attempt index", () => {
      expect(calculateRetryBackoff(1)).toBe(DEFAULT_RETRY_BACKOFF_MS * 1);
      expect(calculateRetryBackoff(2)).toBe(DEFAULT_RETRY_BACKOFF_MS * 2);
      expect(calculateRetryBackoff(3)).toBe(DEFAULT_RETRY_BACKOFF_MS * 3);
    });

    it("supports custom base milliseconds", () => {
      expect(calculateRetryBackoff(2, 500)).toBe(1000);
      expect(calculateRetryBackoff(0, 1000)).toBe(0);
      expect(calculateRetryBackoff(-1, 1000)).toBe(0);
    });
  });

  describe("isErrorRetryable", () => {
    it("inspects explicit retryable boolean flag", () => {
      expect(isErrorRetryable({ retryable: true })).toBe(true);
      expect(isErrorRetryable({ retryable: false })).toBe(false);
    });

    it("identifies retryable HTTP status codes (429, 502, 503, 504)", () => {
      expect(isErrorRetryable({ status: 429 })).toBe(true);
      expect(isErrorRetryable({ status: 502 })).toBe(true);
      expect(isErrorRetryable({ status: 503 })).toBe(true);
      expect(isErrorRetryable({ status: 504 })).toBe(true);
    });

    it("rejects client HTTP error codes as non-retryable (400, 401, 403, 404)", () => {
      expect(isErrorRetryable({ status: 400 })).toBe(false);
      expect(isErrorRetryable({ status: 401 })).toBe(false);
      expect(isErrorRetryable({ status: 403 })).toBe(false);
      expect(isErrorRetryable({ status: 404 })).toBe(false);
    });

    it("identifies network error codes (ETIMEDOUT, ECONNRESET, ECONNREFUSED)", () => {
      expect(isErrorRetryable({ code: "ETIMEDOUT" })).toBe(true);
      expect(isErrorRetryable({ code: "ECONNRESET" })).toBe(true);
      expect(isErrorRetryable({ code: "ECONNREFUSED" })).toBe(true);
      expect(isErrorRetryable({ code: "EAI_AGAIN" })).toBe(true);
    });

    it("identifies retryable phrases in error messages", () => {
      expect(isErrorRetryable(new Error("Network timeout after 10000ms"))).toBe(true);
      expect(isErrorRetryable(new Error("Rate limit exceeded"))).toBe(true);
      expect(isErrorRetryable(new Error("socket hang up"))).toBe(true);
      expect(isErrorRetryable(new Error("fetch failed"))).toBe(true);
    });

    it("returns false for generic or null errors", () => {
      expect(isErrorRetryable(null)).toBe(false);
      expect(isErrorRetryable(undefined)).toBe(false);
      expect(isErrorRetryable(new Error("Invalid JSON input"))).toBe(false);
      expect(isErrorRetryable({ message: "Field 'assignee' not found" })).toBe(false);
    });
  });

  describe("processWithRetry runner", () => {
    const dummyAuth: OpAuth = { jira: null, bitbucket: null };
    const dummyOp = {
      id: "op-1",
      type: "update-fields",
      requestedBy: "user-1",
      payload: { action: { kind: "update-fields", value: { points: 5 } }, params: {} },
      state: "running",
      startedAt: new Date(),
    };

    it("honors idempotency guard: skips execution if item already succeeded (R-03)", async () => {
      const applyMock = vi.fn();
      const markRunningMock = vi.fn();

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "succeeded" }),
        markItemRunning: markRunningMock,
        applyItem: applyMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 1, deps);

      expect(result).toEqual({ status: "succeeded" });
      expect(markRunningMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
    });

    it("returns skipped if operation is not found in database", async () => {
      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(null),
      };

      const result = await processWithRetry("op-missing", "item-1", "PROJ-1", dummyAuth, 1, deps);
      expect(result).toEqual({ status: "skipped" });
    });

    it("executes successfully on first attempt without backoff sleep", async () => {
      const applyMock = vi.fn().mockResolvedValue({ status: "succeeded" });
      const sleepMock = vi.fn();
      const recordMock = vi.fn();
      const fetchAfterMock = vi.fn().mockResolvedValue({ status: "In Progress", points: 5 });

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "pending" }),
        markItemRunning: vi.fn(),
        applyItem: applyMock,
        sleep: sleepMock,
        recordItemResult: recordMock,
        fetchAfterState: fetchAfterMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 2, deps);

      expect(result).toEqual({ status: "succeeded", error: undefined, retryable: undefined });
      expect(applyMock).toHaveBeenCalledTimes(1);
      expect(sleepMock).not.toHaveBeenCalled();
      expect(fetchAfterMock).toHaveBeenCalledWith("PROJ-1");
      expect(recordMock).toHaveBeenCalledWith("item-1", {
        status: "succeeded",
        error: undefined,
        retryable: undefined,
        attempts: 1,
        after: { status: "In Progress", points: 5 },
      });
    });

    it("retries transient failure and succeeds on attempt 2", async () => {
      const applyMock = vi
        .fn()
        .mockResolvedValueOnce({
          status: "failed",
          error: "Jira API 503 Service Unavailable",
          retryable: true,
        })
        .mockResolvedValueOnce({ status: "succeeded" });

      const sleepMock = vi.fn().mockResolvedValue(undefined);
      const recordMock = vi.fn();
      const fetchAfterMock = vi.fn().mockResolvedValue({ status: "Done" });

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "pending" }),
        markItemRunning: vi.fn(),
        applyItem: applyMock,
        sleep: sleepMock,
        recordItemResult: recordMock,
        fetchAfterState: fetchAfterMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 1, deps);

      expect(result).toEqual({ status: "succeeded", error: undefined, retryable: undefined });
      expect(applyMock).toHaveBeenCalledTimes(2);
      expect(sleepMock).toHaveBeenCalledTimes(1);
      expect(sleepMock).toHaveBeenCalledWith(1000); // 1000 * 1
      expect(recordMock).toHaveBeenCalledWith("item-1", {
        status: "succeeded",
        error: undefined,
        retryable: undefined,
        attempts: 2,
        after: { status: "Done" },
      });
    });

    it("aborts retry loop immediately on non-retryable failure (attempt 1)", async () => {
      const applyMock = vi.fn().mockResolvedValue({
        status: "failed",
        error: "Issue type Bug does not support story points",
        retryable: false,
      });

      const sleepMock = vi.fn();
      const recordMock = vi.fn();

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "pending" }),
        markItemRunning: vi.fn(),
        applyItem: applyMock,
        sleep: sleepMock,
        recordItemResult: recordMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 1, deps);

      expect(result).toEqual({
        status: "failed",
        error: "Issue type Bug does not support story points",
        retryable: false,
      });
      expect(applyMock).toHaveBeenCalledTimes(1);
      expect(sleepMock).not.toHaveBeenCalled();
      expect(recordMock).toHaveBeenCalledWith("item-1", {
        status: "failed",
        error: "Issue type Bug does not support story points",
        retryable: false,
        attempts: 1,
        after: null,
      });
    });

    it("exhausts max attempts for persistent retryable failures", async () => {
      const applyMock = vi.fn().mockResolvedValue({
        status: "failed",
        error: "Gateway timeout 504",
        retryable: true,
      });

      const sleepMock = vi.fn().mockResolvedValue(undefined);
      const recordMock = vi.fn();

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "pending" }),
        markItemRunning: vi.fn(),
        applyItem: applyMock,
        sleep: sleepMock,
        recordItemResult: recordMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 1, deps);

      expect(result).toEqual({
        status: "failed",
        error: "Gateway timeout 504",
        retryable: true,
      });
      expect(applyMock).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS); // 3
      expect(sleepMock).toHaveBeenCalledTimes(2); // after attempt 1 and attempt 2, not after 3
      expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepMock).toHaveBeenNthCalledWith(2, 2000);
      expect(recordMock).toHaveBeenCalledWith("item-1", {
        status: "failed",
        error: "Gateway timeout 504",
        retryable: true,
        attempts: 3,
        after: null,
      });
    });

    it("terminates without retry if applyItem returns skipped", async () => {
      const applyMock = vi.fn().mockResolvedValue({ status: "skipped" });
      const sleepMock = vi.fn();
      const recordMock = vi.fn();

      const deps: ProcessWithRetryDeps = {
        findOperation: vi.fn().mockResolvedValue(dummyOp),
        findItem: vi.fn().mockResolvedValue({ id: "item-1", status: "pending" }),
        markItemRunning: vi.fn(),
        applyItem: applyMock,
        sleep: sleepMock,
        recordItemResult: recordMock,
      };

      const result = await processWithRetry("op-1", "item-1", "PROJ-1", dummyAuth, 1, deps);

      expect(result).toEqual({ status: "skipped", error: undefined, retryable: undefined });
      expect(applyMock).toHaveBeenCalledTimes(1);
      expect(sleepMock).not.toHaveBeenCalled();
      expect(recordMock).toHaveBeenCalledWith("item-1", {
        status: "skipped",
        error: undefined,
        retryable: undefined,
        attempts: 1,
        after: null,
      });
    });
  });
});
