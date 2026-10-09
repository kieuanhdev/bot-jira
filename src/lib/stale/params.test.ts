import { describe, expect, it } from "vitest";
import {
  isAssigneeMatch,
  normalizeFilterValue,
  parseStaleQueryParams,
  resolveAllowedProjects,
  resolveScopedProjects,
} from "./params";

describe("stale query params & scoping", () => {
  describe("normalizeFilterValue", () => {
    it("handles null, empty, whitespace and 'all' sentinel", () => {
      expect(normalizeFilterValue(null)).toBe("");
      expect(normalizeFilterValue("")).toBe("");
      expect(normalizeFilterValue("   ")).toBe("");
      expect(normalizeFilterValue("all")).toBe("");
      expect(normalizeFilterValue("ALL")).toBe("");
      expect(normalizeFilterValue("  all  ")).toBe("");
      expect(normalizeFilterValue("alice")).toBe("alice");
      expect(normalizeFilterValue("  In Progress  ")).toBe("In Progress");
    });
  });

  describe("parseStaleQueryParams", () => {
    it("parses empty URL into clean defaults", () => {
      const params = parseStaleQueryParams("http://localhost/api/stale");
      expect(params).toEqual({
        project: "",
        projectList: [],
        assignee: "",
        status: "",
        reason: "",
        severity: "",
      });
    });

    it("parses and normalizes project and filters", () => {
      const params = parseStaleQueryParams(
        "http://localhost/api/stale?project=epm&projectList=EPM,MHRM,INVALID&assignee=alice&status=In%20Progress&reason=no_assignee&severity=high",
      );
      expect(params.project).toBe("EPM");
      expect(params.projectList).toEqual(["EPM", "MHRM", "INVALID"]);
      expect(params.assignee).toBe("alice");
      expect(params.status).toBe("In Progress");
      expect(params.reason).toBe("no_assignee");
      expect(params.severity).toBe("high");
    });

    it("treats 'all' filter params as empty string", () => {
      const params = parseStaleQueryParams(
        "http://localhost/api/stale?assignee=all&status=all&reason=all&severity=all",
      );
      expect(params.assignee).toBe("");
      expect(params.status).toBe("");
      expect(params.reason).toBe("");
      expect(params.severity).toBe("");
    });
  });

  describe("resolveAllowedProjects", () => {
    const catalog = [
      { key: "EPM" },
      { key: "MHRM" },
      { key: "CORE" },
    ];

    it("returns user board projects filtered by active catalog", () => {
      const allowed = resolveAllowedProjects(["epm", "mhrm", "UNKNOWN"], catalog);
      expect(allowed).toEqual(["EPM", "MHRM"]);
    });

    it("falls back to all active projects when user has no board preferences", () => {
      const allowed = resolveAllowedProjects([], catalog);
      expect(allowed).toEqual(["EPM", "MHRM", "CORE"]);
    });

    it("falls back to all active projects when user board projects are all inactive", () => {
      const allowed = resolveAllowedProjects(["OBSOLETE", "ARCHIVED"], catalog);
      expect(allowed).toEqual(["EPM", "MHRM", "CORE"]);
    });
  });

  describe("resolveScopedProjects", () => {
    const activeKeys = new Set(["EPM", "MHRM", "CORE"]);
    const allowed = ["EPM", "MHRM"];

    it("returns single project when specified and active", () => {
      const scoped = resolveScopedProjects({ project: "CORE", projectList: ["EPM"] }, allowed, activeKeys);
      expect(scoped).toEqual(["CORE"]);
    });

    it("returns valid projectList when project param is empty or not in active catalog", () => {
      const scoped = resolveScopedProjects(
        { project: "INVALID", projectList: ["MHRM", "EPM", "GHOST"] },
        allowed,
        activeKeys,
      );
      expect(scoped).toEqual(["MHRM", "EPM"]);
    });

    it("falls back to allowedProjects when neither project nor projectList are valid", () => {
      const scoped = resolveScopedProjects(
        { project: "", projectList: [] },
        allowed,
        activeKeys,
      );
      expect(scoped).toEqual(allowed);
    });
  });

  describe("isAssigneeMatch", () => {
    it("returns true if filter is empty", () => {
      expect(isAssigneeMatch("alice", "", "alice", ["alice"])).toBe(true);
      expect(isAssigneeMatch(null, "", "alice", ["alice"])).toBe(true);
    });

    it("handles 'me' filter with username aliases", () => {
      expect(isAssigneeMatch("alice", "me", "alice", ["alice", "alice.dev"])).toBe(true);
      expect(isAssigneeMatch("alice.dev", "me", "alice", ["alice", "alice.dev"])).toBe(true);
      expect(isAssigneeMatch("ALICE", "me", "alice", ["alice"])).toBe(true);
      expect(isAssigneeMatch("bob", "me", "alice", ["alice"])).toBe(false);
      expect(isAssigneeMatch(null, "me", "alice", ["alice"])).toBe(false);
      // When myUsername is null, "me" is treated defensively as match-all
      expect(isAssigneeMatch("bob", "me", null, [])).toBe(true);
    });

    it("handles 'unassigned' filter", () => {
      expect(isAssigneeMatch(null, "unassigned", "alice", ["alice"])).toBe(true);
      expect(isAssigneeMatch("alice", "unassigned", "alice", ["alice"])).toBe(false);
    });

    it("handles exact match", () => {
      expect(isAssigneeMatch("alice", "alice", "alice", ["alice"])).toBe(true);
      expect(isAssigneeMatch("bob", "alice", "alice", ["alice"])).toBe(false);
      expect(isAssigneeMatch(null, "alice", "alice", ["alice"])).toBe(false);
    });
  });
});
