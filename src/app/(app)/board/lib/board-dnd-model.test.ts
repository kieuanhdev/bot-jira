import { describe, expect, it } from "vitest";
import type { IssueItem } from "@/hooks/use-issues";
import { equalStringSets, issueKeyFromDragId, resolveBoardDrop } from "./board-dnd-model";

const issue = { jiraKey: "EPM-1", status: "To Do" } as IssueItem;
const issues = new Map([[issue.jiraKey, issue]]);

describe("board drag and drop model", () => {
  it("normalizes card-prefixed and plain drag ids", () => {
    expect(issueKeyFromDragId("card:EPM-1")).toBe("EPM-1");
    expect(issueKeyFromDragId("EPM-1")).toBe("EPM-1");
  });

  it("resolves a drop only when it changes columns", () => {
    const findColumnForIssue = () => "todo";
    expect(
      resolveBoardDrop({
        activeId: "EPM-1",
        overId: "progress",
        issueByKey: issues,
        findColumnForIssue,
      })
    ).toEqual({ key: "EPM-1", targetColumn: "progress" });
    expect(
      resolveBoardDrop({
        activeId: "EPM-1",
        overId: "todo",
        issueByKey: issues,
        findColumnForIssue,
      })
    ).toBeNull();
  });

  it("ignores missing targets and unknown cards", () => {
    const findColumnForIssue = () => "todo";
    expect(resolveBoardDrop({ activeId: "EPM-1", overId: null, issueByKey: issues, findColumnForIssue })).toBeNull();
    expect(resolveBoardDrop({ activeId: "NOPE", overId: "done", issueByKey: issues, findColumnForIssue })).toBeNull();
  });

  it("compares allowed-column sets without depending on insertion order", () => {
    expect(equalStringSets(new Set(["todo", "done"]), new Set(["done", "todo"]))).toBe(true);
    expect(equalStringSets(new Set(["todo"]), new Set(["done"]))).toBe(false);
    expect(equalStringSets(null, new Set())).toBe(false);
  });
});
