import { describe, expect, it } from "vitest";
import { buildIssueRelationships, relationshipKeys } from "./relationships";

describe("issue relationships", () => {
  it("maps epic, subtasks and both Jira link directions", () => {
    const fields = {
      parent: {
        key: "APP-10",
        fields: { summary: "Checkout epic", issuetype: { name: "Epic" }, status: { name: "In Progress" } },
      },
      subtasks: [{ key: "APP-12", fields: { summary: "Add tests", status: { name: "To Do" } } }],
      issuelinks: [
        {
          id: "1",
          type: { id: "10", name: "Blocks", inward: "is blocked by", outward: "blocks" },
          inwardIssue: { key: "APP-8", fields: { summary: "API contract" } },
        },
        {
          id: "2",
          type: { id: "11", name: "Relates", inward: "relates to", outward: "relates to" },
          outwardIssue: { key: "APP-20", fields: { summary: "Mobile UI" } },
        },
      ],
    };

    const result = buildIssueRelationships("APP-11", fields);
    expect(result.epic?.jiraKey).toBe("APP-10");
    expect(result.parent).toBeNull();
    expect(result.children.map((item) => item.jiraKey)).toEqual(["APP-12"]);
    expect(result.links.map((item) => [item.jiraKey, item.relation])).toEqual([
      ["APP-8", "is blocked by"],
      ["APP-20", "relates to"],
    ]);
  });

  it("adds cached Epic children and enriches sparse references", () => {
    const result = buildIssueRelationships(
      "APP-10",
      { issuelinks: [{
        id: "1",
        type: { id: "10", name: "Blocks", inward: "is blocked by", outward: "blocks" },
        outwardIssue: { key: "APP-30" },
      }] },
      [
        { jiraKey: "APP-11", summary: "Story one", status: "To Do", type: "Story", epicKey: "APP-10" },
        { jiraKey: "APP-30", summary: "Dependency", status: "Done", type: "Task" },
      ]
    );

    expect(result.children).toHaveLength(1);
    expect(result.children[0].summary).toBe("Story one");
    expect(result.links[0]).toMatchObject({ jiraKey: "APP-30", summary: "Dependency", status: "Done" });
  });

  it("returns all referenced keys once and excludes the current issue", () => {
    expect(relationshipKeys("APP-1", {
      parent: { key: "APP-2" },
      subtasks: [{ key: "APP-3" }],
      issuelinks: [{
        id: "1",
        type: { id: "10", name: "Relates", inward: "relates", outward: "relates" },
        inwardIssue: { key: "APP-1" },
        outwardIssue: { key: "APP-3" },
      }],
    })).toEqual(["APP-2", "APP-3"]);
  });
});
