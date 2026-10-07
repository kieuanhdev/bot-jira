import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOARD_FILTERS,
  countActiveIssueFilters,
  effectiveAssignees,
  normalizeAssigneeScope,
  normalizeAssigneeToken,
  parseIssueFilters,
  serializeIssueFilters,
  type AssigneeScope,
  type IssueFilters,
} from "./issue-filters";

describe("issue-filters unit tests", () => {
  describe("normalizeAssigneeToken", () => {
    it("normalizes 'me' and current user username to 'me'", () => {
      expect(normalizeAssigneeToken("me", "alice")).toBe("me");
      expect(normalizeAssigneeToken("ME", "alice")).toBe("me");
      expect(normalizeAssigneeToken("alice", "alice")).toBe("me");
      expect(normalizeAssigneeToken("ALICE", "alice")).toBe("me");
    });

    it("normalizes 'unassigned' and 'none' to 'unassigned'", () => {
      expect(normalizeAssigneeToken("unassigned")).toBe("unassigned");
      expect(normalizeAssigneeToken("UNASSIGNED")).toBe("unassigned");
      expect(normalizeAssigneeToken("none")).toBe("unassigned");
    });

    it("preserves other usernames trimmed", () => {
      expect(normalizeAssigneeToken("  bob.nguyen  ")).toBe("bob.nguyen");
    });
  });

  describe("normalizeAssigneeScope", () => {
    it("mode 'all' resets roster and sets view to all-selected", () => {
      const scope: AssigneeScope = {
        mode: "all",
        roster: ["me", "bob"],
        view: "bob",
      };
      expect(normalizeAssigneeScope(scope)).toEqual({
        mode: "all",
        roster: [],
        view: "all-selected",
      });
    });

    it("deduplicates tokens case-insensitively and filters out duplicates of me", () => {
      const scope: AssigneeScope = {
        mode: "roster",
        roster: ["me", "bob", "BOB", "alice"],
        view: "bob",
      };
      const normalized = normalizeAssigneeScope(scope, "alice");
      expect(normalized).toEqual({
        mode: "roster",
        roster: ["me", "bob"],
        view: "bob",
      });
    });

    it("resets view to 'all-selected' if view is not in roster", () => {
      const scope: AssigneeScope = {
        mode: "roster",
        roster: ["bob"],
        view: "alice",
      };
      const normalized = normalizeAssigneeScope(scope);
      expect(normalized.view).toBe("all-selected");
    });

    it("converts empty roster to mode 'all'", () => {
      const scope: AssigneeScope = {
        mode: "roster",
        roster: [],
        view: "all-selected",
      };
      expect(normalizeAssigneeScope(scope)).toEqual({
        mode: "all",
        roster: [],
        view: "all-selected",
      });
    });
  });

  describe("effectiveAssignees", () => {
    it("returns 'ALL' when mode is 'all'", () => {
      expect(effectiveAssignees({ mode: "all", roster: [], view: "all-selected" })).toBe("ALL");
    });

    it("returns full roster when view is 'all-selected'", () => {
      expect(
        effectiveAssignees({
          mode: "roster",
          roster: ["me", "bob"],
          view: "all-selected",
        })
      ).toEqual(["me", "bob"]);
    });

    it("returns single view when view is specific token", () => {
      expect(
        effectiveAssignees({
          mode: "roster",
          roster: ["me", "bob"],
          view: "bob",
        })
      ).toEqual(["bob"]);
    });
  });

  describe("countActiveIssueFilters", () => {
    it("returns 0 for identical to default board filters", () => {
      expect(countActiveIssueFilters(DEFAULT_BOARD_FILTERS, DEFAULT_BOARD_FILTERS)).toBe(0);
    });

    it("counts non-default assignee for board", () => {
      const filters: IssueFilters = {
        ...DEFAULT_BOARD_FILTERS,
        assigneeScope: {
          mode: "all",
          roster: [],
          view: "all-selected",
        },
      };
      expect(countActiveIssueFilters(filters, DEFAULT_BOARD_FILTERS)).toBe(1);
    });

    it("counts query and labels correctly", () => {
      const filters: IssueFilters = {
        ...DEFAULT_BOARD_FILTERS,
        query: "login",
        labels: ["backend", "api"],
      };
      // query (1) + labels (2) = 3
      expect(countActiveIssueFilters(filters, DEFAULT_BOARD_FILTERS)).toBe(3);
    });
  });

  describe("serialize and parse URL params", () => {
    it("round-trips complex filters cleanly", () => {
      const filters: IssueFilters = {
        ...DEFAULT_BOARD_FILTERS,
        project: "EPM",
        query: "refactor",
        assigneeScope: {
          mode: "roster",
          roster: ["me", "bob", "unassigned"],
          view: "bob",
        },
        statuses: ["In Progress", "Review"],
        labels: ["core"],
        priorities: ["High"],
        epics: ["EPM-10"],
        roles: ["approver"],
        reporters: ["alice"],
        approvers: ["me"],
        testers: ["unassigned"],
        types: ["Bug"],
        fixVersions: ["2.0"],
        overdue: true,
        includeDone: false,
      };

      const params = serializeIssueFilters(filters, DEFAULT_BOARD_FILTERS);
      expect(params.get("q")).toBe("refactor");
      expect(params.get("assignee")).toBe("bob,me,unassigned");
      expect(params.get("assigneeView")).toBe("bob");
      expect(params.get("status")).toBe("In Progress,Review");
      expect(params.get("epic")).toBe("EPM-10");
      expect(params.get("role")).toBe("approver");
      expect(params.get("overdue")).toBe("1");
      expect(params.get("includeDone")).toBe("0");

      const parsed = parseIssueFilters(params, DEFAULT_BOARD_FILTERS);
      expect(parsed.project).toBe("EPM");
      expect(parsed.query).toBe("refactor");
      expect(parsed.assigneeScope.mode).toBe("roster");
      expect(parsed.assigneeScope.roster).toEqual(["bob", "me", "unassigned"]);
      expect(parsed.assigneeScope.view).toBe("bob");
      expect(parsed.statuses).toEqual(["In Progress", "Review"]);
      expect(parsed.labels).toEqual(["core"]);
      expect(parsed.priorities).toEqual(["High"]);
      expect(parsed.epics).toEqual(["EPM-10"]);
      expect(parsed.roles).toEqual(["approver"]);
      expect(parsed.reporters).toEqual(["alice"]);
      expect(parsed.types).toEqual(["Bug"]);
      expect(parsed.fixVersions).toEqual(["2.0"]);
      expect(parsed.overdue).toBe(true);
      expect(parsed.includeDone).toBe(false);
    });

    it("handles ALL assignee scope correctly", () => {
      const filters: IssueFilters = {
        ...DEFAULT_BOARD_FILTERS,
        assigneeScope: {
          mode: "all",
          roster: [],
          view: "all-selected",
        },
      };
      const params = serializeIssueFilters(filters, DEFAULT_BOARD_FILTERS);
      expect(params.get("assignee")).toBe("ALL");

      const parsed = parseIssueFilters(params, DEFAULT_BOARD_FILTERS);
      expect(parsed.assigneeScope.mode).toBe("all");
      expect(parsed.assigneeScope.roster).toEqual([]);
      expect(parsed.assigneeScope.view).toBe("all-selected");
    });
  });
});
