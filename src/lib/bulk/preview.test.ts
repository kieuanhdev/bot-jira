import { describe, it, expect } from "vitest";
import {
  classifyAction,
  computePreview,
  isStale,
  isTransitionError,
  isTransitionRetryable,
  determineSkipReason,
  type IssueRow,
} from "./preview";
import { JiraRequestError } from "@/lib/jira/client";
import { env } from "@/lib/env";

function mockIssue(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    jiraKey: "EPM-100",
    projectKey: "EPM",
    status: "In Progress",
    assigneeJira: "alice",
    labels: ["backend", "api"],
    fixVersionIds: ["v1"],
    fixVersionNames: ["1.0.0"],
    priority: "Medium",
    type: "Task",
    points: 3,
    dueDate: new Date("2026-10-15T00:00:00Z"),
    originalEstimateSeconds: 7200,
    timeSpentSeconds: 3600,
    updatedAt: new Date(),
    lastSyncedAt: new Date(),
    raw: {
      parent: { key: "EPM-99", fields: { issuetype: { name: "Epic" } } },
    },
    ...overrides,
  };
}

describe("Bulk preview classification & policies", () => {
  describe("classifyAction - all 15 action kinds", () => {
    it("1. update-fields", () => {
      const issue = mockIssue();
      // Blocked when field unavailable
      expect(
        classifyAction(
          { kind: "update-fields", value: { priority: "High" } },
          issue,
          { fieldAvailable: false }
        )
      ).toBe("blocked");

      // No change when values match current state
      expect(
        classifyAction(
          {
            kind: "update-fields",
            value: {
              assignee: "alice",
              priority: "Medium",
              issueType: "Task",
              points: 3,
              dueDate: "2026-10-15",
              labels: ["api", "backend"],
              fixVersions: ["1.0.0"],
              epic: "EPM-99",
            },
          },
          issue,
          {}
        )
      ).toBe("no_change");

      // Will change when any field differs
      expect(
        classifyAction(
          { kind: "update-fields", value: { priority: "High" } },
          issue,
          {}
        )
      ).toBe("will_change");
      expect(
        classifyAction(
          { kind: "update-fields", value: { assignee: "bob" } },
          issue,
          {}
        )
      ).toBe("will_change");
      expect(
        classifyAction(
          { kind: "update-fields", value: { labels: ["new-label"] } },
          issue,
          {}
        )
      ).toBe("will_change");
      expect(
        classifyAction(
          { kind: "update-fields", value: { points: 8 } },
          issue,
          {}
        )
      ).toBe("will_change");
    });

    it("2. assign", () => {
      const issue = mockIssue({ assigneeJira: "alice" });
      expect(classifyAction({ kind: "assign", value: "alice" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "assign", value: "bob" }, issue, {})).toBe("will_change");
      expect(classifyAction({ kind: "assign", value: null }, issue, {})).toBe("will_change");

      const unassigned = mockIssue({ assigneeJira: null });
      expect(classifyAction({ kind: "assign", value: null }, unassigned, {})).toBe("no_change");
      expect(classifyAction({ kind: "assign", value: "alice" }, unassigned, {})).toBe("will_change");
    });

    it("3. add-labels", () => {
      const issue = mockIssue({ labels: ["frontend", "urgent"] });
      expect(classifyAction({ kind: "add-labels", value: ["frontend"] }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "add-labels", value: ["urgent", "frontend"] }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "add-labels", value: ["frontend", "new-label"] }, issue, {})).toBe("will_change");
    });

    it("4. remove-labels", () => {
      const issue = mockIssue({ labels: ["frontend", "urgent"] });
      expect(classifyAction({ kind: "remove-labels", value: ["non-existent"] }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "remove-labels", value: ["frontend"] }, issue, {})).toBe("will_change");
      expect(classifyAction({ kind: "remove-labels", value: ["urgent", "other"] }, issue, {})).toBe("will_change");
    });

    it("5. set-points", () => {
      const issue = mockIssue({ points: 5 });
      expect(classifyAction({ kind: "set-points", value: 5 }, issue, { fieldAvailable: false })).toBe("blocked");
      expect(classifyAction({ kind: "set-points", value: 5 }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-points", value: 8 }, issue, {})).toBe("will_change");
      expect(classifyAction({ kind: "set-points", value: null }, issue, {})).toBe("will_change");
    });

    it("6. set-estimate", () => {
      const issue = mockIssue();
      expect(classifyAction({ kind: "set-estimate", value: "3h" }, issue, { fieldAvailable: false })).toBe("blocked");
      expect(classifyAction({ kind: "set-estimate", value: "3h" }, issue, {})).toBe("will_change");
    });

    it("7. log-work", () => {
      const issue = mockIssue();
      expect(
        classifyAction({ kind: "log-work", value: { timeSpent: "1h 30m" } }, issue, {})
      ).toBe("will_change");
    });

    it("8. set-due-date", () => {
      const issue = mockIssue({ dueDate: new Date("2026-10-15T00:00:00Z") });
      expect(classifyAction({ kind: "set-due-date", value: "2026-10-15" }, issue, { fieldAvailable: false })).toBe("blocked");
      expect(classifyAction({ kind: "set-due-date", value: "2026-10-15" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-due-date", value: "2026-10-20" }, issue, {})).toBe("will_change");
      expect(classifyAction({ kind: "set-due-date", value: null }, issue, {})).toBe("will_change");

      const noDue = mockIssue({ dueDate: null });
      expect(classifyAction({ kind: "set-due-date", value: null }, noDue, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-due-date", value: "2026-10-20" }, noDue, {})).toBe("will_change");
    });

    it("9. set-priority", () => {
      const issue = mockIssue({ priority: "High" });
      expect(classifyAction({ kind: "set-priority", value: "High" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-priority", value: "Lowest" }, issue, {})).toBe("will_change");
    });

    it("10. set-epic", () => {
      const issue = mockIssue({ raw: { epic: { key: "EPM-50" } } });
      expect(classifyAction({ kind: "set-epic", value: "EPM-50" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-epic", value: "EPM-60" }, issue, {})).toBe("will_change");
      expect(classifyAction({ kind: "set-epic", value: null }, issue, {})).toBe("will_change");

      const noEpic = mockIssue({ raw: {} });
      expect(classifyAction({ kind: "set-epic", value: null }, noEpic, {})).toBe("no_change");
      expect(classifyAction({ kind: "set-epic", value: "EPM-50" }, noEpic, {})).toBe("will_change");
    });

    it("11. transition", () => {
      const issue = mockIssue({ status: "In Progress" });
      expect(classifyAction({ kind: "transition", value: "Done" }, issue, { transitionName: null })).toBe("blocked");
      expect(classifyAction({ kind: "transition", value: "in progress" }, issue, { transitionName: "In Progress" })).toBe("no_change");
      expect(classifyAction({ kind: "transition", value: "Done" }, issue, { transitionName: "Done" })).toBe("will_change");
    });

    it("12. add-fix-version", () => {
      const issue = mockIssue({ fixVersionNames: ["1.0.0", "1.1.0"] });
      expect(classifyAction({ kind: "add-fix-version", value: "1.0.0" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "add-fix-version", value: "" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "add-fix-version", value: "1.2.0" }, issue, { fieldAvailable: false })).toBe("blocked");
      expect(classifyAction({ kind: "add-fix-version", value: "1.2.0" }, issue, {})).toBe("will_change");
    });

    it("13. remove-fix-version", () => {
      const issue = mockIssue({ fixVersionNames: ["1.0.0"] });
      expect(classifyAction({ kind: "remove-fix-version", value: "2.0.0" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "remove-fix-version", value: "" }, issue, {})).toBe("no_change");
      expect(classifyAction({ kind: "remove-fix-version", value: "1.0.0" }, issue, { fieldAvailable: false })).toBe("blocked");
      expect(classifyAction({ kind: "remove-fix-version", value: "1.0.0" }, issue, {})).toBe("will_change");
    });

    it("14. add-comment", () => {
      const issue = mockIssue();
      expect(classifyAction({ kind: "add-comment", value: "Looks good" }, issue, {})).toBe("will_change");
    });

    it("15. create-branches", () => {
      const issue = mockIssue();
      expect(classifyAction({ kind: "create-branches", value: {} }, issue, { branchExists: true })).toBe("no_change");
      expect(classifyAction({ kind: "create-branches", value: {} }, issue, { branchExists: false })).toBe("will_change");
      expect(classifyAction({ kind: "create-branches", value: {} }, issue, {})).toBe("unverified");
    });
  });

  describe("computePreview", () => {
    it("computes before/after snapshot for scalar and array fields", () => {
      const issue = mockIssue({
        assigneeJira: "old-user",
        labels: ["tag1"],
        priority: "Low",
        fixVersionNames: ["v1"],
      });

      const resAssign = computePreview({ kind: "assign", value: "new-user" }, issue, {});
      expect(resAssign.before.assignee).toBe("old-user");
      expect(resAssign.after.assignee).toBe("new-user");

      const resLabels = computePreview({ kind: "add-labels", value: ["tag2"] }, issue, {});
      expect(resLabels.before.labels).toEqual(["tag1"]);
      expect(resLabels.after.labels).toEqual(["tag1", "tag2"]);

      const resRemove = computePreview({ kind: "remove-labels", value: ["tag1"] }, issue, {});
      expect(resRemove.after.labels).toEqual([]);

      const resVersion = computePreview({ kind: "add-fix-version", value: "v2" }, issue, {});
      expect(resVersion.after.fixVersions).toEqual(["v1", "v2"]);

      const resRemoveVer = computePreview({ kind: "remove-fix-version", value: "v1" }, issue, {});
      expect(resRemoveVer.after.fixVersions).toEqual([]);

      const resBranch = computePreview(
        { kind: "create-branches", value: {} },
        issue,
        { branchName: "feature/EPM-100", branchExists: false }
      );
      expect(resBranch.after.branch).toBe("feature/EPM-100");
    });

    it("adds stale_data warning when lastSyncedAt exceeds jiraFreshnessMinutes", () => {
      const freshDate = new Date(Date.now() - 60_000); // 1 minute ago
      const freshIssue = mockIssue({ lastSyncedAt: freshDate });
      const freshPreview = computePreview({ kind: "assign", value: "bob" }, freshIssue, {});
      expect(freshPreview.warning).toBeNull();

      const staleDate = new Date(Date.now() - (env.jiraFreshnessMinutes + 10) * 60_000);
      const staleIssue = mockIssue({ lastSyncedAt: staleDate });
      const stalePreview = computePreview({ kind: "assign", value: "bob" }, staleIssue, {});
      expect(stalePreview.warning).toBe("stale_data");
    });
  });

  describe("isStale (BULK-007)", () => {
    it("classifies issue as fresh within threshold", () => {
      const now = new Date("2026-10-09T10:00:00Z");
      const syncedAt = new Date(now.getTime() - env.jiraFreshnessMinutes * 60_000);
      expect(isStale(syncedAt, now)).toBe(false);
    });

    it("classifies issue as stale beyond threshold", () => {
      const now = new Date("2026-10-09T10:00:00Z");
      const syncedAt = new Date(now.getTime() - env.jiraFreshnessMinutes * 60_000 - 1000);
      expect(isStale(syncedAt, now)).toBe(true);
    });
  });

  describe("isTransitionError & isTransitionRetryable (BULK-009)", () => {
    it("classifies 401 and 403 as auth_error (not retryable)", () => {
      const err401 = new JiraRequestError("Unauthorized", 401, false);
      const err403 = new JiraRequestError("Forbidden", 403, false);
      expect(isTransitionError(err401)).toBe("auth_error");
      expect(isTransitionError(err403)).toBe("auth_error");
      expect(isTransitionRetryable("auth_error")).toBe(false);
    });

    it("classifies 429 as rate_limited (retryable)", () => {
      const err429 = new JiraRequestError("Too Many Requests", 429, true);
      expect(isTransitionError(err429)).toBe("rate_limited");
      expect(isTransitionRetryable("rate_limited")).toBe(true);
    });

    it("classifies 5xx as upstream_unavailable (retryable)", () => {
      const err500 = new JiraRequestError("Internal Server Error", 500, true);
      const err503 = new JiraRequestError("Service Unavailable", 503, true);
      expect(isTransitionError(err500)).toBe("upstream_unavailable");
      expect(isTransitionError(err503)).toBe("upstream_unavailable");
      expect(isTransitionRetryable("upstream_unavailable")).toBe(true);
    });

    it("returns null for non-JiraRequestError or unhandled statuses", () => {
      expect(isTransitionError(new Error("Generic"))).toBeNull();
      expect(isTransitionError(new JiraRequestError("Bad Request", 400, false))).toBeNull();
      expect(isTransitionRetryable("no_transition")).toBe(false);
      expect(isTransitionRetryable("unverified")).toBe(false);
      expect(isTransitionRetryable(null)).toBe(false);
    });
  });

  describe("determineSkipReason", () => {
    it("handles no_change and unverified", () => {
      expect(determineSkipReason("no_change")).toBe("no_change");
      expect(determineSkipReason("unverified")).toBe("unverified");
      expect(determineSkipReason("will_change")).toBeNull();
    });

    it("handles blocked priority options", () => {
      // 1. Explicit fieldSkipReason takes priority
      expect(
        determineSkipReason("blocked", {
          fieldSkipReason: "version_not_found",
          fieldAvailable: false,
        })
      ).toBe("version_not_found");

      // 2. fieldAvailable: false -> field_unavailable
      expect(
        determineSkipReason("blocked", {
          fieldAvailable: false,
        })
      ).toBe("field_unavailable");

      // 3. transitionError
      expect(
        determineSkipReason("blocked", {
          transitionError: "auth_error",
        })
      ).toBe("auth_error");

      // 4. Default -> no_transition
      expect(determineSkipReason("blocked")).toBe("no_transition");
    });
  });
});
