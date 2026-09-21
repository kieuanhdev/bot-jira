import { describe, it, expect } from "vitest";
import {
  tasksForFixVersion,
  fixVersionWhere,
  type ReleaseTask,
} from "./version";

type CachedIssue = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  lastSyncedAt: Date;
  fixVersionIds: string[];
  deletedAt: Date | null;
};

function makeIssue(overrides: Partial<CachedIssue> = {}): CachedIssue {
  return {
    jiraKey: "PROJ-1",
    summary: "test",
    description: "",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    lastSyncedAt: new Date("2026-09-21T00:00:00Z"),
    fixVersionIds: ["v1"],
    deletedAt: null,
    ...overrides,
  };
}

describe("M3-01 version mapping", () => {
  it("maps only issues carrying the Fix Version", () => {
    const issues = [
      makeIssue({ jiraKey: "PROJ-1", fixVersionIds: ["v1"] }),
      makeIssue({ jiraKey: "PROJ-2", fixVersionIds: ["v1", "v2"] }),
      makeIssue({ jiraKey: "PROJ-3", fixVersionIds: ["v2"] }),
    ];
    const tasks = tasksForFixVersion(issues, "v1");
    expect(tasks.map((t) => t.jiraKey)).toEqual(["PROJ-1", "PROJ-2"]);
  });

  it("excludes soft-deleted issues even if they carry the version", () => {
    const issues = [
      makeIssue({ jiraKey: "PROJ-1", fixVersionIds: ["v1"] }),
      makeIssue({
        jiraKey: "PROJ-2",
        fixVersionIds: ["v1"],
        deletedAt: new Date("2026-09-01T00:00:00Z"),
      }),
    ];
    const tasks = tasksForFixVersion(issues, "v1");
    expect(tasks.map((t) => t.jiraKey)).toEqual(["PROJ-1"]);
  });

  it("returns an empty set when the version id is empty/absent", () => {
    const issues = [makeIssue({ fixVersionIds: ["v1"] })];
    expect(tasksForFixVersion(issues, "")).toEqual([]);
    expect(tasksForFixVersion(issues, "v1")).toHaveLength(1);
  });

  it("returns an empty set when no issue carries the version", () => {
    const issues = [makeIssue({ fixVersionIds: ["v2", "v3"] })];
    expect(tasksForFixVersion(issues, "v1")).toEqual([]);
  });

  it("projects the fields used by the release ready-check", () => {
    const tasks = tasksForFixVersion([makeIssue()], "v1");
    const t: ReleaseTask = tasks[0];
    expect(t).toMatchObject({
      jiraKey: "PROJ-1",
      summary: "test",
      priority: "Medium",
      status: "Done",
      statusCategory: "done",
    });
    expect(t.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("fixVersionWhere filters live IssueCache rows by version and excludes deleted", () => {
    const where = fixVersionWhere("v42");
    expect(where).toEqual({
      deletedAt: null,
      fixVersionIds: { has: "v42" },
    });
  });
});
