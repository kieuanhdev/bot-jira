import { describe, it, expect } from "vitest";
import { renderBranchName, defaultBranchTemplate } from "./branch-name";
import {
  computePreview,
  normalizeKey,
  isStale,
  validateBulkRequest,
  isTransitionError,
  isTransitionRetryable,
  MAX_KEYS,
} from "./ops";
import { JiraRequestError } from "@/lib/jira/client";

describe("renderBranchName", () => {
  it("renders {project}-{number} by default shape", () => {
    expect(renderBranchName("{project}-{number}", "EPM-123", "In Progress")).toBe("EPM-123");
  });

  it("substitutes {issue}", () => {
    expect(renderBranchName("feature/{issue}", "EPM-123", "In Progress")).toBe("feature/EPM-123");
  });

  it("substitutes {project} and {number}", () => {
    expect(renderBranchName("{project}/{number}-dev", "MR-45", "Backlog")).toBe("MR/45-dev");
  });

  it("substitutes {status} lowercased with dashes", () => {
    expect(renderBranchName("{status}", "MR-45", "In Progress")).toBe("in-progress");
  });

  it("falls back to task when status is empty", () => {
    expect(renderBranchName("{status}", "MR-45", "")).toBe("task");
  });

  it("sanitizes illegal characters", () => {
    expect(renderBranchName("{issue}", "MR-45", "A&B!")).toBe("MR-45");
    // characters like & and ! are stripped to dashes
    expect(renderBranchName("{status}", "MR-45", "A B")).toBe("a-b");
  });

  it("handles keys without a number", () => {
    expect(renderBranchName("{project}-{number}", "EPM", "Done")).toBe("EPM-EPM");
  });

  it("returns a stable default template", () => {
    expect(defaultBranchTemplate()).toBe("{project}-{number}");
  });
});

const baseIssue = {
  jiraKey: "EPM-1",
  projectKey: "EPM",
  status: "To Do",
  assigneeJira: "alice",
  labels: ["a", "b"],
  fixVersionIds: ["1"],
  fixVersionNames: ["1.0"],
  priority: "Medium",
  points: 3,
  updatedAt: new Date(),
  lastSyncedAt: new Date(), // fresh, not stale
};

describe("computePreview", () => {
  it("add-labels merges without duplicates", () => {
    const { after } = computePreview(
      { kind: "add-labels", value: ["b", "c"] },
      baseIssue,
      {}
    );
    expect(after.labels).toEqual(["a", "b", "c"]);
    expect((computePreview({ kind: "add-labels", value: ["b", "c"] }, baseIssue, {}) as { classification: string }).classification).toBe("will_change");
  });

  it("classifies a no-op when adding an already-present label", () => {
    const { classification } = computePreview(
      { kind: "add-labels", value: ["a"] },
      baseIssue,
      {}
    );
    expect(classification).toBe("no_change");
  });

  it("classifies a no-op when the assignee is unchanged", () => {
    const { classification } = computePreview({ kind: "assign", value: "alice" }, baseIssue, {});
    expect(classification).toBe("no_change");
  });

  it("remove-labels drops listed labels", () => {
    const { after } = computePreview(
      { kind: "remove-labels", value: ["a"] },
      baseIssue,
      {}
    );
    expect(after.labels).toEqual(["b"]);
  });

  it("assign updates assignee", () => {
    const { after } = computePreview({ kind: "assign", value: "bob" }, baseIssue, {});
    expect(after.assignee).toBe("bob");
  });

  it("transition updates status and blocks when no transition exists", () => {
    const ok = computePreview({ kind: "transition", value: "In Progress" }, baseIssue, { transitionName: "In Progress" });
    expect(ok.after.status).toBe("In Progress");
    expect(ok.warning).toBeNull();
    expect(ok.classification).toBe("will_change");

    const missing = computePreview({ kind: "transition", value: "Nope" }, baseIssue, { transitionName: null });
    expect(missing.classification).toBe("blocked");
  });

  it("add-fix-version appends only if absent", () => {
    const added = computePreview({ kind: "add-fix-version", value: "1.1" }, baseIssue, {});
    expect(added.after.fixVersions).toEqual(["1.0", "1.1"]);
    const dup = computePreview({ kind: "add-fix-version", value: "1.0" }, baseIssue, {});
    expect(dup.after.fixVersions).toEqual(["1.0"]);
  });

  it("remove-fix-version removes by name", () => {
    const { after } = computePreview(
      { kind: "remove-fix-version", value: "1.0" },
      { ...baseIssue, fixVersionNames: ["1.0", "1.1"] },
      {}
    );
    expect(after.fixVersions).toEqual(["1.1"]);
  });

  it("create-branches sets branch and classifies existing as no_change", () => {
    const fresh = computePreview(
      { kind: "create-branches", value: {} },
      baseIssue,
      { branchName: "EPM-1", branchExists: false }
    );
    expect(fresh.after.branch).toBe("EPM-1");
    expect(fresh.warning).toBeNull();
    expect(fresh.classification).toBe("will_change");

    const exists = computePreview(
      { kind: "create-branches", value: {} },
      baseIssue,
      { branchName: "EPM-1", branchExists: true }
    );
    expect(exists.classification).toBe("no_change");
  });

  it("create-branches is unverified when branch existence is unknown", () => {
    const { classification } = computePreview(
      { kind: "create-branches", value: {} },
      baseIssue,
      { branchName: "EPM-1", branchExists: undefined }
    );
    expect(classification).toBe("unverified");
  });

  it("flags stale data when lastSyncedAt is old", () => {
    const stale = computePreview(
      { kind: "assign", value: "bob" },
      { ...baseIssue, lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      {}
    );
    expect(stale.warning).toBe("stale_data");
  });

  it("does NOT flag stale when only updatedAt is old (BULK-007)", () => {
    const freshCache = computePreview(
      { kind: "assign", value: "bob" },
      { ...baseIssue, updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      {}
    );
    expect(freshCache.warning).toBeNull();
  });
});

describe("normalizeKey", () => {
  it("trims and uppercases", () => {
    expect(normalizeKey("  epm-123 ")).toBe("EPM-123");
  });

  it("leaves empty strings empty", () => {
    expect(normalizeKey("   ")).toBe("");
  });
});

describe("isStale (BULK-007)", () => {
  it("is true when the cache snapshot is older than the freshness window", () => {
    expect(isStale(new Date(Date.now() - 2 * 60 * 60 * 1000), new Date())).toBe(true);
  });

  it("is false when the cache is fresh", () => {
    expect(isStale(new Date(Date.now() - 30_000), new Date())).toBe(false);
  });
});

describe("validateBulkRequest (BULK-004)", () => {
  it("accepts a valid assign action and normalizes keys", () => {
    const r = validateBulkRequest({
      keys: ["epm-1", " EPM-2 ", "epm-1"],
      action: { kind: "assign", value: "alice" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keys).toEqual(["EPM-1", "EPM-2"]);
      expect(r.action).toEqual({ kind: "assign", value: "alice" });
    }
  });

  it("rejects empty keys", () => {
    const r = validateBulkRequest({ keys: ["   "], action: { kind: "assign", value: "a" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("non-empty"))).toBe(true);
  });

  it("rejects more than MAX_KEYS", () => {
    const keys = Array.from({ length: MAX_KEYS + 1 }, (_, i) => `EPM-${i}`);
    const r = validateBulkRequest({ keys, action: { kind: "assign", value: "a" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("too many"))).toBe(true);
  });

  it("rejects an unknown action kind", () => {
    const r = validateBulkRequest({ keys: ["EPM-1"], action: { kind: "explode", value: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("unknown action"))).toBe(true);
  });

  it("rejects a set-points value that is not an integer", () => {
    const r = validateBulkRequest({ keys: ["EPM-1"], action: { kind: "set-points", value: 2.5 } });
    expect(r.ok).toBe(false);
  });

  it("accepts null points (clear)", () => {
    const r = validateBulkRequest({ keys: ["EPM-1"], action: { kind: "set-points", value: null } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toEqual({ kind: "set-points", value: null });
  });

  it("requires a non-empty comment", () => {
    expect(validateBulkRequest({ keys: ["EPM-1"], action: { kind: "add-comment", value: "   " } }).ok).toBe(false);
  });

  it("trims and dedupes labels", () => {
    const r = validateBulkRequest({
      keys: ["EPM-1"],
      action: { kind: "add-labels", value: [" a ", "a", "b"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toEqual({ kind: "add-labels", value: ["a", "b"] });
  });

  it("rejects an empty labels array", () => {
    const r = validateBulkRequest({ keys: ["EPM-1"], action: { kind: "add-labels", value: [] } });
    expect(r.ok).toBe(false);
  });
});

describe("isTransitionError (BULK-009)", () => {
  it("maps 401/403 to auth_error", () => {
    expect(isTransitionError(new JiraRequestError("x", 401, false))).toBe("auth_error");
    expect(isTransitionError(new JiraRequestError("x", 403, false))).toBe("auth_error");
  });

  it("maps 429 to rate_limited", () => {
    expect(isTransitionError(new JiraRequestError("x", 429, true))).toBe("rate_limited");
  });

  it("maps 5xx to upstream_unavailable", () => {
    expect(isTransitionError(new JiraRequestError("x", 503, true))).toBe("upstream_unavailable");
  });

  it("returns null for non-Jira errors (falls back to unverified)", () => {
    expect(isTransitionError(new Error("boom"))).toBeNull();
  });

  it("retryable only for rate/unavailable", () => {
    expect(isTransitionRetryable("rate_limited")).toBe(true);
    expect(isTransitionRetryable("upstream_unavailable")).toBe(true);
    expect(isTransitionRetryable("auth_error")).toBe(false);
    expect(isTransitionRetryable("no_transition")).toBe(false);
  });
});
