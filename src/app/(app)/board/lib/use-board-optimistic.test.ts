import { describe, expect, it } from "vitest";
import { applyOptimisticStatus } from "./use-board-optimistic";

describe("board optimistic status model", () => {
  it("returns the original object when no override exists", () => {
    const issue = { jiraKey: "EPM-1", status: "To Do" };
    expect(applyOptimisticStatus(issue, new Map())).toBe(issue);
  });

  it("returns a copy with the temporary status when overridden", () => {
    const issue = { jiraKey: "EPM-1", status: "To Do", summary: "Task" };
    expect(applyOptimisticStatus(issue, new Map([["EPM-1", "In Progress"]]))).toEqual({
      jiraKey: "EPM-1",
      status: "In Progress",
      summary: "Task",
    });
    expect(issue.status).toBe("To Do");
  });
});
