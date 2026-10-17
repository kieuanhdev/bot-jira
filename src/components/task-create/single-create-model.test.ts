import { describe, expect, it } from "vitest";
import type { BulkCreatePreviewItem, BulkCreatePreviewResult } from "@/lib/bulk/create-types";
import {
  SLOW_QUEUE_MS,
  STUCK_CREATE_MS,
  isSpinning,
  singleCreateReducer,
  type SingleCreateOperation,
  type SingleCreatePhase,
} from "./single-create-model";

function previewItem(overrides: Partial<BulkCreatePreviewItem> = {}): BulkCreatePreviewItem {
  return {
    rowIndex: 0,
    clientRef: "row-1",
    summary: "Fix login",
    classification: "ready",
    warnings: [],
    errors: [],
    normalizedFields: {},
    ...overrides,
  };
}

function preview(item: BulkCreatePreviewItem, blocked = 0): BulkCreatePreviewResult {
  return {
    operationId: "op-1",
    type: "create-issues",
    total: 1,
    actionable: blocked > 0 ? 0 : 1,
    blocked,
    metadataFingerprint: "fp",
    items: [item],
  };
}

function op(overrides: Partial<SingleCreateOperation> = {}): SingleCreateOperation {
  return {
    id: "op-1",
    state: "running",
    createItems: [{ jiraKey: null, status: "running", error: null }],
    ...overrides,
  };
}

const creating: SingleCreatePhase = { kind: "creating", operationId: "op-1", startedAt: 1_000 };

describe("singleCreateReducer", () => {
  it("moves to previewing on submit", () => {
    expect(singleCreateReducer({ kind: "idle" }, { type: "submit" })).toEqual({ kind: "previewing" });
  });

  it("ignores submit while previewing or creating", () => {
    expect(singleCreateReducer({ kind: "previewing" }, { type: "submit" })).toEqual({ kind: "previewing" });
    expect(singleCreateReducer(creating, { type: "submit" })).toBe(creating);
  });

  it("goes to blocked with errors when preview has blocked items", () => {
    const errors = [{ field: "summary", code: "REQUIRED", message: "Thiếu tiêu đề" }];
    const next = singleCreateReducer(
      { kind: "previewing" },
      { type: "preview-ok", result: preview(previewItem({ classification: "blocked", errors }), 1), now: 5 }
    );
    expect(next).toEqual({ kind: "blocked", errors });
  });

  it("goes to duplicate when preview has a duplicate-summary warning", () => {
    const warning = { field: "summary", code: "DUPLICATE_SUMMARY_JIRA", message: "Trùng ABC-9" };
    const next = singleCreateReducer(
      { kind: "previewing" },
      {
        type: "preview-ok",
        result: preview(previewItem({ warnings: [warning], existingDuplicateKey: "ABC-9" })),
        now: 5,
      }
    );
    expect(next).toEqual({ kind: "duplicate", warnings: [warning], operationId: "op-1" });
  });

  it("ignores non-duplicate warnings and goes straight to creating", () => {
    const next = singleCreateReducer(
      { kind: "previewing" },
      {
        type: "preview-ok",
        result: preview(previewItem({ warnings: [{ field: "labels", message: "Label mới" }] })),
        now: 5,
      }
    );
    expect(next).toEqual({ kind: "creating", operationId: "op-1", startedAt: 5 });
  });

  it("goes to creating on a clean preview", () => {
    const next = singleCreateReducer({ kind: "previewing" }, { type: "preview-ok", result: preview(previewItem()), now: 42 });
    expect(next).toEqual({ kind: "creating", operationId: "op-1", startedAt: 42 });
  });

  it("goes to failed when preview request errors", () => {
    expect(singleCreateReducer({ kind: "previewing" }, { type: "preview-error", message: "403" })).toEqual({
      kind: "failed",
      message: "403",
    });
  });

  it("force-confirm moves duplicate to creating", () => {
    const next = singleCreateReducer(
      { kind: "duplicate", warnings: [], operationId: "op-1" },
      { type: "force-confirm", now: 77 }
    );
    expect(next).toEqual({ kind: "creating", operationId: "op-1", startedAt: 77 });
  });

  it("force-confirm is ignored outside duplicate", () => {
    expect(singleCreateReducer({ kind: "idle" }, { type: "force-confirm", now: 1 })).toEqual({ kind: "idle" });
  });

  it("goes to failed when confirm request errors", () => {
    expect(singleCreateReducer(creating, { type: "confirm-error", message: "boom" })).toEqual({
      kind: "failed",
      message: "boom",
    });
  });

  it("goes to done when poll returns a jiraKey", () => {
    const next = singleCreateReducer(creating, {
      type: "poll",
      operation: op({ state: "completed", createItems: [{ jiraKey: "ABC-1", status: "succeeded", error: null }] }),
    });
    expect(next).toEqual({ kind: "done", jiraKey: "ABC-1" });
  });

  it("goes to failed with item.error when poll returns a failed item", () => {
    const next = singleCreateReducer(creating, {
      type: "poll",
      operation: op({ state: "failed", createItems: [{ jiraKey: null, status: "failed", error: "Jira 400: bad field" }] }),
    });
    expect(next).toEqual({ kind: "failed", message: "Jira 400: bad field" });
  });

  it("goes to failed with a fallback message when a failed item has no error", () => {
    const next = singleCreateReducer(creating, {
      type: "poll",
      operation: op({ state: "failed", createItems: [{ jiraKey: null, status: "blocked", error: null }] }),
    });
    expect(next.kind).toBe("failed");
  });

  it("goes to failed when the operation is terminal without a key", () => {
    const next = singleCreateReducer(creating, {
      type: "poll",
      operation: op({ state: "cancelled", createItems: [{ jiraKey: null, status: "cancelled", error: null }] }),
    });
    expect(next.kind).toBe("failed");
  });

  it("stays creating while the item is still running", () => {
    expect(singleCreateReducer(creating, { type: "poll", operation: op() })).toBe(creating);
  });

  it("ignores polls for a different operation", () => {
    const next = singleCreateReducer(creating, {
      type: "poll",
      operation: op({ id: "op-2", createItems: [{ jiraKey: "ABC-2", status: "succeeded", error: null }] }),
    });
    expect(next).toBe(creating);
  });

  it("moves to queued-slow when a tick at >= SLOW_QUEUE_MS finds the op still queued", () => {
    expect(SLOW_QUEUE_MS).toBe(20_000);
    const next = singleCreateReducer(creating, { type: "tick", now: 1_000 + 20_000, opState: "queued" });
    expect(next).toEqual({ kind: "queued-slow", operationId: "op-1" });
  });

  it("treats an unknown op state on tick as still queued", () => {
    const next = singleCreateReducer(creating, { type: "tick", now: 1_000 + 25_000 });
    expect(next).toEqual({ kind: "queued-slow", operationId: "op-1" });
  });

  it("stays creating when a tick comes before SLOW_QUEUE_MS", () => {
    expect(singleCreateReducer(creating, { type: "tick", now: 1_000 + 19_999, opState: "queued" })).toBe(creating);
  });

  it("stays creating after SLOW_QUEUE_MS when the op is already running", () => {
    expect(singleCreateReducer(creating, { type: "tick", now: 1_000 + 30_000, opState: "running" })).toBe(creating);
  });

  it("goes from queued-slow to done when a poll returns a key", () => {
    const next = singleCreateReducer(
      { kind: "queued-slow", operationId: "op-1" },
      { type: "poll", operation: op({ state: "completed", createItems: [{ jiraKey: "ABC-1", status: "succeeded", error: null }] }) }
    );
    expect(next).toEqual({ kind: "done", jiraKey: "ABC-1" });
  });

  it("resets to idle", () => {
    expect(singleCreateReducer({ kind: "done", jiraKey: "ABC-1" }, { type: "reset" })).toEqual({ kind: "idle" });
  });

  it("moves to queued-slow after STUCK_CREATE_MS even when the op is running", () => {
    expect(STUCK_CREATE_MS).toBe(120_000);
    expect(singleCreateReducer(creating, { type: "tick", now: 1_000 + 119_999, opState: "running" })).toBe(creating);
    const next = singleCreateReducer(creating, { type: "tick", now: 1_000 + 120_000, opState: "running" });
    expect(next).toEqual({ kind: "queued-slow", operationId: "op-1" });
  });

  it("moves to queued-slow after STUCK_CREATE_MS whatever the op state", () => {
    const next = singleCreateReducer(creating, { type: "tick", now: 1_000 + 120_000, opState: "failed" });
    expect(next.kind).toBe("queued-slow");
  });

  it("carries the project captured at submit through to done", () => {
    let s = singleCreateReducer({ kind: "idle" }, { type: "submit", projectKey: "AAA" });
    s = singleCreateReducer(s, { type: "preview-ok", result: preview(previewItem()), now: 1_000 });
    expect(s).toMatchObject({ kind: "creating", projectKey: "AAA" });
    s = singleCreateReducer(s, { type: "tick", now: 1_000 + SLOW_QUEUE_MS, opState: "queued" });
    expect(s).toMatchObject({ kind: "queued-slow", projectKey: "AAA" });
    s = singleCreateReducer(s, {
      type: "poll",
      operation: op({ state: "completed", createItems: [{ jiraKey: "AAA-9", status: "succeeded", error: null }] }),
    });
    expect(s).toEqual({ kind: "done", jiraKey: "AAA-9", projectKey: "AAA" });
  });

  it("keeps the captured project through a duplicate force-confirm", () => {
    let s = singleCreateReducer({ kind: "idle" }, { type: "submit", projectKey: "BBB" });
    s = singleCreateReducer(s, {
      type: "preview-ok",
      result: preview(previewItem({ warnings: [{ code: "DUPLICATE_SUMMARY_JIRA", message: "dup" }] })),
      now: 1_000,
    });
    expect(s).toMatchObject({ kind: "duplicate", projectKey: "BBB" });
    s = singleCreateReducer(s, { type: "force-confirm", now: 2_000 });
    expect(s).toMatchObject({ kind: "creating", projectKey: "BBB" });
  });

  it("stops the spinner once the create is slow or stuck", () => {
    expect(isSpinning({ kind: "previewing" })).toBe(true);
    expect(isSpinning(creating)).toBe(true);
    expect(isSpinning({ kind: "queued-slow", operationId: "op-1" })).toBe(false);
    expect(isSpinning({ kind: "done", jiraKey: "A-1" })).toBe(false);
  });
});
