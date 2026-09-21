import { describe, it, expect } from "vitest";
import { renderBranchName, defaultBranchTemplate } from "./branch-name";
import { computePreview } from "./ops";

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

  it("transition updates status and warns when no transition exists", () => {
    const ok = computePreview({ kind: "transition", value: "In Progress" }, baseIssue, { transitionName: "In Progress" });
    expect(ok.after.status).toBe("In Progress");
    expect(ok.warning).toBeNull();

    const missing = computePreview({ kind: "transition", value: "Nope" }, baseIssue, { transitionName: null });
    expect(missing.warning).toBe("no_transition");
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

  it("create-branches sets branch and warns when it already exists", () => {
    const fresh = computePreview(
      { kind: "create-branches", value: {} },
      baseIssue,
      { branchName: "EPM-1", branchExists: false }
    );
    expect(fresh.after.branch).toBe("EPM-1");
    expect(fresh.warning).toBeNull();

    const exists = computePreview(
      { kind: "create-branches", value: {} },
      baseIssue,
      { branchName: "EPM-1", branchExists: true }
    );
    expect(exists.warning).toBe("branch_exists");
  });

  it("flags stale data when lastSyncedAt is old", () => {
    const stale = computePreview(
      { kind: "assign", value: "bob" },
      { ...baseIssue, lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      {}
    );
    expect(stale.warning).toBe("stale_data");
  });
});
