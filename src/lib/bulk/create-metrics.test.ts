import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  recordPreviewMetrics,
  recordExecutionMetrics,
  recordSearchMetrics,
  SLOW_PREVIEW_THRESHOLD_MS,
  SLOW_EXECUTION_THRESHOLD_MS,
  SLOW_SEARCH_THRESHOLD_MS,
} from "./create-metrics";

describe("Bulk Create Metrics and Slow Operation Alerts", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("records normal preview metrics without warning when under threshold", () => {
    const result = recordPreviewMetrics({
      operationId: "op-123",
      projectKey: "EPM",
      durationMs: 450,
      total: 10,
      actionable: 8,
      blocked: 2,
      warningCount: 1,
      blockedByErrorCode: { PARENT_REQUIRED: 2 },
      invalidAssigneeCount: 0,
      batchParentCount: 2,
      jiraParentCount: 0,
    });

    expect(result.isSlow).toBe(false);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    const logged = JSON.parse(String(consoleInfoSpy.mock.calls[0][0]));
    expect(logged.event).toBe("bulk_create_preview_metrics");
    expect(logged.durationMs).toBe(450);
    expect(logged.blockedByErrorCode).toEqual({ PARENT_REQUIRED: 2 });
  });

  it("emits slow preview alert when duration exceeds threshold", () => {
    const result = recordPreviewMetrics({
      operationId: "op-slow",
      projectKey: "EPM",
      durationMs: SLOW_PREVIEW_THRESHOLD_MS + 500,
      total: 50,
      actionable: 50,
      blocked: 0,
      warningCount: 0,
      blockedByErrorCode: {},
      invalidAssigneeCount: 0,
      batchParentCount: 10,
      jiraParentCount: 5,
    });

    expect(result.isSlow).toBe(true);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

    const warnLog = JSON.parse(String(consoleWarnSpy.mock.calls[0][0]));
    expect(warnLog.event).toBe("bulk_create_slow_preview_alert");
    expect(warnLog.durationMs).toBe(SLOW_PREVIEW_THRESHOLD_MS + 500);
  });

  it("records normal execution metrics without warning", () => {
    const result = recordExecutionMetrics({
      operationId: "op-exec-1",
      projectKey: "EPM",
      durationMs: 1200,
      rounds: 2,
      total: 5,
      succeeded: 5,
      failed: 0,
      blockedByParent: 0,
      slowItemCount: 0,
    });

    expect(result.isSlow).toBe(false);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("emits slow execution alert when duration or slowItemCount exceeds threshold", () => {
    const result = recordExecutionMetrics({
      operationId: "op-exec-slow",
      projectKey: "EPM",
      durationMs: SLOW_EXECUTION_THRESHOLD_MS + 1000,
      rounds: 3,
      total: 10,
      succeeded: 8,
      failed: 2,
      blockedByParent: 0,
      slowItemCount: 2,
    });

    expect(result.isSlow).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

    const warnLog = JSON.parse(String(consoleWarnSpy.mock.calls[0][0]));
    expect(warnLog.event).toBe("bulk_create_slow_execution_alert");
    expect(warnLog.slowItemCount).toBe(2);
  });

  it("records search metrics and alerts on slow search", () => {
    const normal = recordSearchMetrics({
      type: "assignees",
      projectKey: "EPM",
      query: "john",
      durationMs: 300,
      resultCount: 5,
    });
    expect(normal.isSlow).toBe(false);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    const slow = recordSearchMetrics({
      type: "parents",
      projectKey: "EPM",
      query: "issue",
      durationMs: SLOW_SEARCH_THRESHOLD_MS + 500,
      resultCount: 20,
    });
    expect(slow.isSlow).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });
});
