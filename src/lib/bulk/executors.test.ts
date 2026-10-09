import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isFieldUpdateAction,
  executeFieldUpdateAction,
  executeTransitionAction,
  executeCommentAction,
  executeWorklogAction,
  executeBranchAction,
  createBranchForIssue,
  executeBulkAction,
  applyItem,
  type BulkExecutionContext,
  type JiraClientInstance,
  type Ctx,
} from "./executors";
import { prisma } from "@/lib/prisma";
import { bitbucket } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { recordExplicitBranchLink } from "@/lib/bitbucket/link-service";
import { audit } from "@/lib/audit";
import { JiraRequestError, jiraWith } from "@/lib/jira/client";

vi.mock("@/lib/jira/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira/client")>("@/lib/jira/client");
  return {
    ...actual,
    jiraWith: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      findUnique: vi.fn(),
    },
    bulkOperationItem: {
      findUnique: vi.fn(),
    },
    fixVersionPropagation: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    getBranch: vi.fn(),
    createBranch: vi.fn(),
  },
}));

vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: vi.fn(),
}));

vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfComment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bitbucket/link-service", () => ({
  recordExplicitBranchLink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  audit: vi.fn().mockResolvedValue("audit-123"),
}));

function createMockJira(overrides?: Partial<Record<string, unknown>>) {
  return {
    getIssue: vi.fn().mockResolvedValue({
      key: "PROJ-1",
      fields: {
        project: { key: "PROJ" },
        labels: ["tag1"],
        fixVersions: [{ id: "v1", name: "1.0.0" }],
      },
    }),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    getEditMeta: vi.fn().mockResolvedValue({
      fields: {
        timetracking: { name: "Time Tracking" },
        duedate: { name: "Due Date" },
        fixVersions: { name: "Fix Versions" },
      },
    }),
    resolveVersionId: vi.fn().mockResolvedValue("v-resolved"),
    findTransition: vi.fn().mockResolvedValue({ id: "tr-10", name: "In Progress" }),
    transition: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({ id: "comm-1", author: { name: "alice", displayName: "Alice" } }),
    addWorklog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as JiraClientInstance;
}

describe("Bulk Action Executors (M4-03 / M4-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isFieldUpdateAction", () => {
    it("returns true for all 11 field update kinds", () => {
      const fieldKinds = [
        "update-fields",
        "set-epic",
        "assign",
        "add-labels",
        "remove-labels",
        "set-points",
        "set-estimate",
        "set-due-date",
        "set-priority",
        "add-fix-version",
        "remove-fix-version",
      ] as const;

      for (const kind of fieldKinds) {
        expect(isFieldUpdateAction({ kind, value: "x" } as never)).toBe(true);
      }
    });

    it("returns false for non-field update actions", () => {
      expect(isFieldUpdateAction({ kind: "transition", value: "Done" })).toBe(false);
      expect(isFieldUpdateAction({ kind: "add-comment", value: "test" })).toBe(false);
      expect(isFieldUpdateAction({ kind: "log-work", value: { timeSpent: "1h" } })).toBe(false);
      expect(isFieldUpdateAction({ kind: "create-branches", value: {} })).toBe(false);
    });
  });

  describe("executeFieldUpdateAction", () => {
    it("executes update-fields with multiple fields and resolves fixVersions", async () => {
      const jira = createMockJira({
        resolveVersionId: vi.fn(async (_proj, name) => (name === "1.0.0" ? "v1" : "v2")),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeFieldUpdateAction(ctx, "PROJ-1", {
        kind: "update-fields",
        value: {
          assignee: "dev_user",
          labels: ["frontend"],
          priority: "High",
          issueType: "Story",
          points: 5,
          dueDate: "2026-10-15",
          estimate: "2h 30m",
          epic: "PROJ-10",
          fixVersions: ["1.0.0", "2.0.0"],
        },
      });

      expect(res).toBeUndefined();
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", {
        assignee: "dev_user",
        labels: ["frontend"],
        priority: "High",
        issueType: "Story",
        points: 5,
        dueDate: "2026-10-15",
        originalEstimate: "2h 30m",
        epic: "PROJ-10",
        fixVersions: ["v1", "v2"],
      });
    });

    it("handles update-fields with empty fixVersions array", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };

      await executeFieldUpdateAction(ctx, "PROJ-1", {
        kind: "update-fields",
        value: { fixVersions: [] },
      });

      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", {
        fixVersions: [],
      });
    });

    it("returns non-retryable failure when fixVersions cannot be resolved in project", async () => {
      const jira = createMockJira({
        resolveVersionId: vi.fn().mockResolvedValue(null),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeFieldUpdateAction(ctx, "PROJ-1", {
        kind: "update-fields",
        value: { fixVersions: ["unknown-version"] },
      });

      expect(res).toEqual({
        error: "One or more Fix Versions do not exist in this project",
        retryable: false,
      });
      expect(jira.updateIssue).not.toHaveBeenCalled();
    });

    it("executes set-epic, assign, set-points, set-priority", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "set-epic", value: "EPIC-1" });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { epic: "EPIC-1" });

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "assign", value: "user2" });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { assignee: "user2" });

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "set-points", value: 8 });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { points: 8 });

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "set-priority", value: "High" });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { priority: "High" });
    });

    it("executes add-labels by merging with existing labels", async () => {
      const jira = createMockJira({
        getIssue: vi.fn().mockResolvedValue({
          fields: { labels: ["existing", "tag1"] },
        }),
      });
      const ctx: BulkExecutionContext = { jira };

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "add-labels", value: ["tag1", "newtag"] });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", {
        labels: ["existing", "tag1", "newtag"],
      });
    });

    it("executes remove-labels by filtering out existing labels", async () => {
      const jira = createMockJira({
        getIssue: vi.fn().mockResolvedValue({
          fields: { labels: ["tag1", "keep_me", "tag2"] },
        }),
      });
      const ctx: BulkExecutionContext = { jira };

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "remove-labels", value: ["tag1", "tag2"] });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", {
        labels: ["keep_me"],
      });
    });

    it("executes set-estimate when timetracking is editable, and fails gracefully when not", async () => {
      const jiraEditable = createMockJira({
        getEditMeta: vi.fn().mockResolvedValue({ fields: { timetracking: {} } }),
      });
      const ctxEditable: BulkExecutionContext = { jira: jiraEditable };

      await executeFieldUpdateAction(ctxEditable, "PROJ-1", { kind: "set-estimate", value: "3h" });
      expect(jiraEditable.updateIssue).toHaveBeenCalledWith("PROJ-1", { originalEstimate: "3h" });

      const jiraNonEditable = createMockJira({
        getEditMeta: vi.fn().mockResolvedValue({ fields: {} }),
      });
      const ctxNonEditable: BulkExecutionContext = { jira: jiraNonEditable };

      const res = await executeFieldUpdateAction(ctxNonEditable, "PROJ-1", { kind: "set-estimate", value: "3h" });
      expect(res).toEqual({
        error: "Time Tracking is not editable for this Jira issue. Add it to the issue edit screen.",
        retryable: false,
      });
      expect(jiraNonEditable.updateIssue).not.toHaveBeenCalled();
    });

    it("executes set-due-date when duedate is editable, and fails when not", async () => {
      const jira = createMockJira({
        getEditMeta: vi.fn().mockResolvedValue({ fields: { duedate: {} } }),
      });
      const ctx: BulkExecutionContext = { jira };

      await executeFieldUpdateAction(ctx, "PROJ-1", { kind: "set-due-date", value: "2026-12-31" });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { dueDate: "2026-12-31" });

      const jiraNoDate = createMockJira({
        getEditMeta: vi.fn().mockResolvedValue({ fields: {} }),
      });
      const res = await executeFieldUpdateAction({ jira: jiraNoDate }, "PROJ-1", { kind: "set-due-date", value: "2026-12-31" });
      expect(res).toEqual({
        error: "Due Date is not editable for this Jira issue",
        retryable: false,
      });
    });

    it("executes add-fix-version and tracks propagation & audit for dependencies", async () => {
      const jira = createMockJira({
        getIssue: vi.fn().mockResolvedValue({
          fields: {
            project: { key: "PROJ" },
            fixVersions: [{ id: "v1" }],
          },
        }),
        resolveVersionId: vi.fn().mockResolvedValue("v2"),
      });
      vi.mocked(prisma.bulkOperationItem.findUnique).mockResolvedValue({
        requested: { relation: "dependency", rootKey: "ROOT-1" },
      } as never);

      const ctx: BulkExecutionContext = {
        jira,
        operationId: "op-1",
        requestedBy: "user-1",
      };

      await executeFieldUpdateAction(ctx, "PROJ-2", {
        kind: "add-fix-version",
        value: "2.0.0",
      });

      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-2", {
        fixVersions: ["v1", "v2"],
      });
      expect(prisma.fixVersionPropagation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            rootKey_dependencyKey_jiraVersionId: {
              rootKey: "ROOT-1",
              dependencyKey: "PROJ-2",
              jiraVersionId: "v2",
            },
          },
        })
      );
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "issue.fix_version.propagate",
          target: "PROJ-2",
          correlationId: "op-1",
        })
      );
    });

    it("add-fix-version returns failure when version is not found", async () => {
      const jira = createMockJira({
        resolveVersionId: vi.fn().mockResolvedValue(null),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeFieldUpdateAction(ctx, "PROJ-1", {
        kind: "add-fix-version",
        value: "missing-ver",
      });

      expect(res).toEqual({
        error: 'Version "missing-ver" not found',
        retryable: false,
      });
      expect(jira.updateIssue).not.toHaveBeenCalled();
    });

    it("executes remove-fix-version and updates propagation & audit when removed", async () => {
      const jira = createMockJira({
        getIssue: vi.fn().mockResolvedValue({
          fields: {
            project: { key: "PROJ" },
            fixVersions: [{ id: "v1" }, { id: "v2" }],
          },
        }),
        resolveVersionId: vi.fn().mockResolvedValue("v1"),
      });

      const ctx: BulkExecutionContext = {
        jira,
        operationId: "op-1",
        requestedBy: "user-1",
      };

      await executeFieldUpdateAction(ctx, "PROJ-1", {
        kind: "remove-fix-version",
        value: "1.0.0",
      });

      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", {
        fixVersions: ["v2"],
      });
      expect(prisma.fixVersionPropagation.updateMany).toHaveBeenCalledWith({
        where: { dependencyKey: "PROJ-1", jiraVersionId: "v1" },
        data: expect.objectContaining({ active: false }),
      });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "issue.fix_version.propagate_remove",
          target: "PROJ-1",
          correlationId: "op-1",
        })
      );
    });
  });

  describe("executeTransitionAction", () => {
    it("transitions issue when transition is found", async () => {
      const jira = createMockJira({
        findTransition: vi.fn().mockResolvedValue({ id: "31", name: "Done" }),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeTransitionAction(ctx, "PROJ-1", {
        kind: "transition",
        value: "Done",
      });

      expect(res).toBeUndefined();
      expect(jira.transition).toHaveBeenCalledWith("PROJ-1", "31");
    });

    it("returns non-retryable failure when transition is not found", async () => {
      const jira = createMockJira({
        findTransition: vi.fn().mockResolvedValue(null),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeTransitionAction(ctx, "PROJ-1", {
        kind: "transition",
        value: "Closed",
      });

      expect(res).toEqual({
        error: 'No transition to "Closed"',
        retryable: false,
      });
      expect(jira.transition).not.toHaveBeenCalled();
    });
  });

  describe("executeCommentAction", () => {
    it("adds comment and notifies watchers", async () => {
      const jira = createMockJira({
        addComment: vi.fn().mockResolvedValue({
          id: "c-100",
          author: { name: "bob", displayName: "Bob" },
        }),
      });
      const ctx: BulkExecutionContext = { jira };

      const res = await executeCommentAction(ctx, "PROJ-1", {
        kind: "add-comment",
        value: "Hello world",
      });

      expect(res).toBeUndefined();
      expect(jira.addComment).toHaveBeenCalledWith("PROJ-1", "Hello world");
      expect(notifyWatchersOfComment).toHaveBeenCalledWith("PROJ-1", "bob", "Hello world", "c-100");
    });
  });

  describe("executeWorklogAction", () => {
    it("logs work with formatJiraStartedAt when started is given", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };

      await executeWorklogAction(ctx, "PROJ-1", {
        kind: "log-work",
        value: {
          timeSpent: "1h 30m",
          comment: "Worked on unit tests",
          started: "2026-10-09T08:30:00.000Z",
        },
      });

      expect(jira.addWorklog).toHaveBeenCalledWith(
        "PROJ-1",
        expect.objectContaining({
          timeSpent: "1h 30m",
          comment: "Worked on unit tests",
        }),
        "leave"
      );
    });

    it("logs work without started when not provided", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };

      await executeWorklogAction(ctx, "PROJ-1", {
        kind: "log-work",
        value: { timeSpent: "45m" },
      });

      expect(jira.addWorklog).toHaveBeenCalledWith(
        "PROJ-1",
        { timeSpent: "45m", started: undefined, comment: undefined },
        "leave"
      );
    });
  });

  describe("createBranchForIssue & executeBranchAction", () => {
    it("creates branch if not existing, links branch, and comments on Jira if requested", async () => {
      const jira = createMockJira({
        addComment: vi.fn().mockResolvedValue({ id: "c-branch", author: { name: "user1" } }),
      });
      vi.mocked(prisma.issueCache.findUnique).mockResolvedValue({ status: "In Progress" } as never);
      vi.mocked(bitbucket.getBranch).mockResolvedValue(null as never);
      vi.mocked(bitbucket.createBranch).mockResolvedValue(undefined as never);

      const res = await createBranchForIssue(
        jira,
        "PROJ-10",
        { repo: "my-repo", base: "main", comment: true },
        { user: "u", token: "t" }
      );

      expect(res.branch).toBeDefined();
      expect(res.repo).toBe("my-repo");
      expect(bitbucket.createBranch).toHaveBeenCalled();
      expect(recordExplicitBranchLink).toHaveBeenCalledWith("my-repo", res.branch, "PROJ-10");
      expect(jira.addComment).toHaveBeenCalled();
      expect(notifyWatchersOfComment).toHaveBeenCalled();
    });

    it("reuses existing branch without re-creating", async () => {
      const jira = createMockJira();
      vi.mocked(prisma.issueCache.findUnique).mockResolvedValue({ status: "To Do" } as never);
      vi.mocked(bitbucket.getBranch).mockResolvedValue({ name: "feature/PROJ-10" } as never);

      const res = await createBranchForIssue(
        jira,
        "PROJ-10",
        { repo: "my-repo" },
        { user: "u", token: "t" }
      );

      expect(bitbucket.createBranch).not.toHaveBeenCalled();
      expect(recordExplicitBranchLink).toHaveBeenCalled();
      expect(res.branch).toBeDefined();
    });

    it("executeBranchAction fails when bitbucket creds missing", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira, bitbucket: null };

      const res = await executeBranchAction(ctx, "PROJ-1", {
        kind: "create-branches",
        value: { repo: "my-repo" },
      });

      expect(res).toEqual({
        error: "Bitbucket credentials required",
        retryable: false,
      });
    });
  });

  describe("executeBulkAction coordinator", () => {
    it("calls executor and refreshes Jira cache upon success", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };

      const result = await executeBulkAction(ctx, "PROJ-1", {
        kind: "set-priority",
        value: "Low",
      });

      expect(result).toEqual({ status: "succeeded" });
      expect(jira.updateIssue).toHaveBeenCalledWith("PROJ-1", { priority: "Low" });
      expect(refreshJiraIssueCache).toHaveBeenCalledWith(jira, "PROJ-1");
    });

    it("does not call refreshJiraIssueCache when executor returns error", async () => {
      const jira = createMockJira({
        findTransition: vi.fn().mockResolvedValue(null),
      });
      const ctx: BulkExecutionContext = { jira };

      const result = await executeBulkAction(ctx, "PROJ-1", {
        kind: "transition",
        value: "NonExistent",
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain('No transition to "NonExistent"');
      expect(refreshJiraIssueCache).not.toHaveBeenCalled();
    });

    it("handles JiraRequestError with retryable flag and skips cache refresh", async () => {
      const reqErr = new JiraRequestError("Service Unavailable", 503, true, "gateway down");
      const jira = createMockJira({
        updateIssue: vi.fn().mockRejectedValue(reqErr),
      });
      const ctx: BulkExecutionContext = { jira };

      const result = await executeBulkAction(ctx, "PROJ-1", {
        kind: "assign",
        value: "user1",
      });

      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
      expect(refreshJiraIssueCache).not.toHaveBeenCalled();
    });

    it("handles log-work timeout with special non-retryable message to prevent duplicate logs", async () => {
      const timeoutErr = new JiraRequestError("Gateway Timeout", 504, false, "timed out");
      const jira = createMockJira({
        addWorklog: vi.fn().mockRejectedValue(timeoutErr),
      });
      const ctx: BulkExecutionContext = { jira };

      const result = await executeBulkAction(ctx, "PROJ-1", {
        kind: "log-work",
        value: { timeSpent: "2h" },
      });

      expect(result).toEqual({
        status: "failed",
        error: "Jira timeout: outcome_unknown to prevent duplicate worklog",
        retryable: false,
      });
    });

    it("returns failure when jira is missing from context", async () => {
      const ctx = {} as unknown as BulkExecutionContext;
      const res = await executeBulkAction(ctx, "PROJ-1", { kind: "set-points", value: 3 });
      expect(res).toEqual({
        status: "failed",
        error: "Jira credentials required",
        retryable: false,
      });
    });

    it("returns failure for unknown action kinds", async () => {
      const jira = createMockJira();
      const ctx: BulkExecutionContext = { jira };
      const res = await executeBulkAction(ctx, "PROJ-1", { kind: "unsupported" } as never);
      expect(res).toEqual({
        status: "failed",
        error: "unknown action",
        retryable: false,
      });
    });
  });

  describe("applyItem adapter", () => {
    it("fails when auth.jira is null", async () => {
      const ctx: Ctx = {
        op: {
          id: "op-1",
          type: "set-points",
          requestedBy: "user-1",
          payload: { action: { kind: "set-points", value: 5 } },
        },
        auth: { jira: null, bitbucket: null },
      };

      const res = await applyItem(ctx, "PROJ-1");
      expect(res).toEqual({
        status: "failed",
        error: "Jira credentials required",
        retryable: false,
      });
    });

    it("adapts Ctx to BulkExecutionContext and executes successfully", async () => {
      const mockJira = createMockJira();
      vi.mocked(jiraWith).mockReturnValue(mockJira);

      const ctx: Ctx = {
        op: {
          id: "op-1",
          type: "set-points",
          requestedBy: "user-1",
          payload: { action: { kind: "set-points", value: 5 } },
        },
        auth: {
          jira: { user: "a@b.c", token: "tok", authMode: "basic" },
          bitbucket: null,
        },
      };

      const res = await applyItem(ctx, "PROJ-1");
      expect(res.status).toBe("succeeded");
      expect(mockJira.updateIssue).toHaveBeenCalledWith("PROJ-1", { points: 5 });
    });
  });
});
