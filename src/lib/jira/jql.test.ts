import { describe, it, expect } from "vitest";
import {
  buildBoardJql,
  escapeJql,
  buildDefaultPollJql,
  buildProjectPollJql,
  formatJqlDate,
  projectClause,
} from "./jql";

describe("escapeJql", () => {
  it("wraps in quotes", () => {
    expect(escapeJql("In Progress")).toBe('"In Progress"');
  });
  it("escapes embedded quotes", () => {
    expect(escapeJql('say "hi"')).toBe('"say \\"hi\\""');
  });
});

describe("projectClause", () => {
  it("single project", () => {
    expect(projectClause("CICM")).toBe("project = CICM");
  });
  it("no arg uses all configured (in clause)", () => {
    expect(projectClause()).toBe("project in (CICM, EDM, EMA, EPM, ETM, MHRM, MR)");
  });
});

describe("buildBoardJql", () => {
  it("scopes to a single project when given", () => {
    const jql = buildBoardJql({ project: "EDM" });
    expect(jql).toContain("project = EDM");
    expect(jql).not.toContain("project in");
  });

  it("includes project by default", () => {
    const jql = buildBoardJql();
    expect(jql).toContain("project in");
    expect(jql).toContain("statusCategory != Done");
  });

  it("adds assignee clause", () => {
    const jql = buildBoardJql({ assignee: "alice" });
    expect(jql).toContain('assignee = "alice"');
  });

  it("adds label clause", () => {
    const jql = buildBoardJql({ label: "frontend" });
    expect(jql).toContain('labels = "frontend"');
  });

  it("uses status when given", () => {
    const jql = buildBoardJql({ status: "In Progress" });
    expect(jql).toContain('status = "In Progress"');
    expect(jql).not.toContain("statusCategory != Done");
  });

  it("adds search clause", () => {
    const jql = buildBoardJql({ q: "login" });
    expect(jql).toContain('text ~ "login"');
    expect(jql).toContain('key ~ "login"');
  });
});

describe("buildDefaultPollJql", () => {
  it("targets the configured projects, all issues (no recency window)", () => {
    const jql = buildDefaultPollJql();
    expect(jql).toMatch(/project (in \(.+\)|= [A-Z]+)/);
    // We sync the full history, so there must be no "updated >= …" window.
    expect(jql).not.toContain("updated >=");
  });
});

describe("incremental poll JQL", () => {
  it("formats dates in Jira's quoted UTC format", () => {
    expect(formatJqlDate(new Date("2026-09-19T04:05:59.000Z"))).toBe("2026/09/19 04:05");
  });

  it("scopes and orders an incremental project query", () => {
    const jql = buildProjectPollJql("epm", new Date("2026-09-19T04:05:00.000Z"));
    expect(jql).toContain('project = EPM AND updated >= "2026/09/19 04:05"');
    expect(jql).toContain("ORDER BY updated ASC, key ASC");
  });
});
