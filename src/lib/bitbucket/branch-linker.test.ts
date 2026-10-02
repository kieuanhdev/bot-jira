import { describe, it, expect } from "vitest";
import { extractJiraKeys, resolveBranchLink } from "./branch-linker";

describe("extractJiraKeys", () => {
  it("extracts clean jira keys from branch names", () => {
    expect(extractJiraKeys("feature/EPM-123-fix")).toEqual(["EPM-123"]);
    expect(extractJiraKeys("hotfix/epm-456_update")).toEqual(["EPM-456"]);
    expect(extractJiraKeys("EPM-1")).toEqual(["EPM-1"]);
  });

  it("does not match non-jira words or partial numbers improperly", () => {
    expect(extractJiraKeys("main")).toEqual([]);
    expect(extractJiraKeys("develop")).toEqual([]);
    expect(extractJiraKeys("v1.2.3")).toEqual([]);
    expect(extractJiraKeys("fix-bug")).toEqual([]);
    expect(extractJiraKeys("user/authentication_flow")).toEqual([]);
  });

  it("handles word boundaries: EPM-1 vs EPM-10", () => {
    expect(extractJiraKeys("feature/EPM-10-test")).toEqual(["EPM-10"]);
    expect(extractJiraKeys("feature/EPM-1-test")).toEqual(["EPM-1"]);
  });

  it("extracts multiple unique keys", () => {
    expect(extractJiraKeys("merge-EPM-100-and-EPM-200-task")).toEqual(["EPM-100", "EPM-200"]);
  });
  it("filters out false positive prefixes like FIX, RELEASE, HOTFIX, UI, HANDLING", () => {
    expect(extractJiraKeys("hot-fix-5.9.2")).toEqual([]);
    expect(extractJiraKeys("release-4.8.1")).toEqual([]);
    expect(extractJiraKeys("fix/api-error-handling-500")).toEqual([]);
    expect(extractJiraKeys("feature/update-ui-1")).toEqual([]);
  });
});

describe("resolveBranchLink", () => {
  const cache = new Set(["EPM-1", "EPM-2", "EPM-3395", "PROJ_ABC-99"]);

  it("preserves manual and explicit links with confidence 100", () => {
    const res = resolveBranchLink({
      branch: "feature/EPM-1-fix",
      existingJiraKey: "EPM-2",
      existingLinkSource: "manual",
      validJiraKeys: cache,
    });
    expect(res).toEqual({
      jiraKey: "EPM-2",
      linkSource: "manual",
      linkConfidence: 100,
      linkState: "confirmed",
      suggestedJiraKey: null,
    });
  });

  it("permanently preserves manual unlinked decisions against auto resolver", () => {
    const res = resolveBranchLink({
      branch: "feature/EPM-3395-payment",
      existingJiraKey: null,
      existingLinkState: "manual_unlinked",
      validJiraKeys: cache,
    });
    expect(res.linkState).toBe("manual_unlinked");
    expect(res.jiraKey).toBeNull();
    expect(res.linkConfidence).toBe(0);
  });

  it("permanently preserves rejected candidate suggestions against auto resolver", () => {
    const res = resolveBranchLink({
      branch: "feature/payment-service",
      prTitle: "EPM-3395: fix checkout payment",
      existingLinkState: "rejected",
      validJiraKeys: cache,
    });
    expect(res.linkState).toBe("rejected");
    expect(res.jiraKey).toBeNull();
    expect(res.suggestedJiraKey).toBeNull();
  });

  it("auto-links branch name when key exists in cache with confidence 95", () => {
    const res = resolveBranchLink({
      branch: "feature/epm-3395-payment",
      validJiraKeys: cache,
    });
    expect(res).toEqual({
      jiraKey: "EPM-3395",
      linkSource: "branch_name",
      linkConfidence: 95,
      linkState: "confirmed",
      suggestedJiraKey: null,
    });
  });

  it("defaults to auto-linking branch name even if key not in cache with confidence 90", () => {
    const res = resolveBranchLink({
      branch: "feature/EPM-9999-not-cached",
      validJiraKeys: cache,
    });
    expect(res.jiraKey).toBe("EPM-9999");
    expect(res.linkConfidence).toBe(90);
    expect(res.linkState).toBe("confirmed");
    expect(res.suggestedJiraKey).toBeNull();
  });

  it("defaults to auto-linking from PR title when branch name has no key with confidence 85", () => {
    const res = resolveBranchLink({
      branch: "feature/payment-refactor",
      prTitle: "EPM-3395: refactor checkout payment",
      validJiraKeys: cache,
    });
    expect(res.jiraKey).toBe("EPM-3395");
    expect(res.suggestedJiraKey).toBeNull();
    expect(res.linkSource).toBe("pr_title");
    expect(res.linkConfidence).toBe(85);
    expect(res.linkState).toBe("confirmed");
  });

  it("marks multiple conflicting branch candidates as ambiguous", () => {
    const res = resolveBranchLink({
      branch: "feature/EPM-10-and-EPM-20",
      validJiraKeys: cache,
    });
    expect(res.jiraKey).toBeNull();
    expect(res.linkConfidence).toBe(0);
    expect(res.linkState).toBe("suggested");
    expect(res.reason).toContain("Multiple candidate keys");
  });

  it("returns null when no candidates are found", () => {
    const res = resolveBranchLink({
      branch: "bugfix/sanitize-input",
      prTitle: "Fix sanitization logic",
      validJiraKeys: cache,
    });
    expect(res).toEqual({
      jiraKey: null,
      linkSource: null,
      linkConfidence: null,
      linkState: "unlinked",
      suggestedJiraKey: null,
    });
  });
});
