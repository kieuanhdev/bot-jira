import { describe, expect, it, beforeEach, vi } from "vitest";
import { DEFAULT_BOARD_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";
import {
  createBoardFilterQuery,
  createBoardFilterSignature,
  createBoardIssueFilters,
  hasBoardFilterParams,
  loadInitialBoardFilters,
} from "./board-filter-controller";
import * as boardStorage from "./board-storage";

function filters(patch: Partial<IssueFilters> = {}): IssueFilters {
  return {
    ...DEFAULT_BOARD_FILTERS,
    assigneeScope: { ...DEFAULT_BOARD_FILTERS.assigneeScope },
    ...patch,
  };
}

describe("board filter controller model", () => {
  it("distinguishes a project-only URL from an explicitly filtered URL", () => {
    expect(hasBoardFilterParams(new URLSearchParams("project=EPM"))).toBe(false);
    expect(hasBoardFilterParams(new URLSearchParams("project=EPM&q=login"))).toBe(true);
    expect(hasBoardFilterParams(null)).toBe(false);
  });

  it("maps issue facets to the board query without empty values", () => {
    expect(
      createBoardIssueFilters({
        filters: filters({ labels: ["backend"], priorities: ["High"] }),
        selectedProject: "EPM",
        debouncedQuery: "login",
        quickFilter: "",
      })
    ).toEqual({
      project: "EPM",
      q: "login",
      label: ["backend"],
      priority: ["High"],
      assignee: ["me"],
      includeDone: true,
      limit: 1000,
    });
  });

  it("lets quick filters override person and boolean facets", () => {
    const base = filters({
      approvers: ["alice"],
      testers: ["bob"],
      assigneeScope: { mode: "all", roster: [], view: "all-selected" },
    });
    expect(
      createBoardIssueFilters({
        filters: base,
        selectedProject: "EPM",
        debouncedQuery: "",
        quickFilter: "missingApprover",
      }).approver
    ).toBe("unassigned");
    expect(
      createBoardIssueFilters({
        filters: base,
        selectedProject: "EPM",
        debouncedQuery: "",
        quickFilter: "unassigned",
      }).assignee
    ).toBe("unassigned");
    expect(
      createBoardIssueFilters({
        filters: base,
        selectedProject: "EPM",
        debouncedQuery: "",
        quickFilter: "stale",
      }).staleDays
    ).toBe(7);
  });

  it("widens assignee scope when role filtering is active", () => {
    const result = createBoardIssueFilters({
      filters: filters({ roles: ["developer"] }),
      selectedProject: "EPM",
      debouncedQuery: "",
      quickFilter: "",
    });
    expect(result.assignee).toBe("ALL");
  });

  it("builds a stable signature when multi-value facet order changes", () => {
    const input = {
      selectedProject: "EPM",
      debouncedQuery: "",
      quickFilter: "" as const,
    };
    expect(
      createBoardFilterSignature({ ...input, filters: filters({ labels: ["b", "a"] }) })
    ).toBe(
      createBoardFilterSignature({ ...input, filters: filters({ labels: ["a", "b"] }) })
    );
  });

  it("serializes the selected project and non-default filters", () => {
    const query = new URLSearchParams(
      createBoardFilterQuery(filters({ query: "login", overdue: true }), "EPM")
    );
    expect(Object.fromEntries(query)).toMatchObject({ project: "EPM", q: "login", overdue: "1" });
  });

  describe("loadInitialBoardFilters", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("initializes with assignee=ALL on step 1 when stored team mode is true", () => {
      vi.spyOn(boardStorage, "loadStoredTeamMode").mockReturnValue(true);
      vi.spyOn(boardStorage, "loadStoredFilters").mockReturnValue(null);

      const result = loadInitialBoardFilters({
        searchParams: null,
        selectedProject: "EPM",
        myName: "alice",
        canUseTeamMode: true,
      });

      expect(result.teamMode).toBe(true);
      expect(result.filters.assigneeScope.mode).toBe("all");

      const queryFilters = createBoardIssueFilters({
        filters: result.filters,
        selectedProject: "EPM",
        debouncedQuery: "",
        quickFilter: "",
      });
      expect(queryFilters.assignee).toBe("ALL");
    });

    it("initializes with assignee=me when team mode is false", () => {
      vi.spyOn(boardStorage, "loadStoredTeamMode").mockReturnValue(false);
      vi.spyOn(boardStorage, "loadStoredFilters").mockReturnValue(null);

      const result = loadInitialBoardFilters({
        searchParams: null,
        selectedProject: "EPM",
        myName: "alice",
        canUseTeamMode: true,
      });

      expect(result.teamMode).toBe(false);
      expect(result.filters.assigneeScope.roster).toEqual(["me"]);

      const queryFilters = createBoardIssueFilters({
        filters: result.filters,
        selectedProject: "EPM",
        debouncedQuery: "",
        quickFilter: "",
      });
      expect(queryFilters.assignee).toEqual(["me"]);
    });

    it("prioritizes URL filters over stored filters and stored team mode", () => {
      vi.spyOn(boardStorage, "loadStoredTeamMode").mockReturnValue(true);

      const urlParams = new URLSearchParams("project=EPM&assignee=bob&status=Done");
      const result = loadInitialBoardFilters({
        searchParams: urlParams,
        selectedProject: "EPM",
        myName: "alice",
        canUseTeamMode: true,
      });

      expect(result.filters.statuses).toEqual(["Done"]);
      expect(result.filters.assigneeScope.roster).toEqual(["bob"]);
    });
  });
});
