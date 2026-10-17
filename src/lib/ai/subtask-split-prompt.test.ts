import { describe, expect, it } from "vitest";
import type { BulkCreateProjectMetadata } from "@/lib/bulk/create-types";
import {
  MAX_SUBTASK_ITEMS,
  SubtaskSplitError,
  buildSubtaskSplitItems,
  buildSubtaskSplitPrompt,
  parseSubtaskSplit,
  resolveSubtaskPlacement,
} from "./subtask-split-prompt";

type Meta = Pick<
  BulkCreateProjectMetadata,
  "issueTypes" | "components" | "hasSubtaskTypes" | "defaultSubtaskTypeId" | "defaultIssueTypeId"
>;

const metadata: Meta = {
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Epic", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
  components: [
    { id: "c1", name: "Frontend" },
    { id: "c2", name: "Backend" },
  ],
  hasSubtaskTypes: true,
  defaultSubtaskTypeId: "10003",
  defaultIssueTypeId: "10001",
};

describe("buildSubtaskSplitPrompt", () => {
  it("wraps the parent task as data and lists components", () => {
    const prompt = buildSubtaskSplitPrompt({
      summary: "Xuất báo cáo Excel",
      description: "Cần nút xuất. token=abcdefghijklmnop",
      components: ["Frontend", "Backend"],
    });
    expect(prompt).toContain("<parent_task>");
    expect(prompt).toContain("</parent_task>");
    expect(prompt).toContain("Xuất báo cáo Excel");
    expect(prompt).toContain('"Frontend", "Backend"');
    expect(prompt).toContain(`${MAX_SUBTASK_ITEMS}`);
    expect(prompt).not.toContain("abcdefghijklmnop");
  });
});

describe("parseSubtaskSplit", () => {
  it("keeps at most 15 items", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ summary: `Việc ${i + 1}` }));
    const parsed = parseSubtaskSplit({ items });
    expect(parsed).toHaveLength(15);
    expect(parsed[0].summary).toBe("Việc 1");
  });

  it("throws on an empty list so generateJson retries", () => {
    expect(() => parseSubtaskSplit({ items: [] })).toThrow();
    expect(() => parseSubtaskSplit({ items: [{ summary: "  " }, { foo: 1 }] })).toThrow();
    expect(() => parseSubtaskSplit({})).toThrow();
    expect(() => parseSubtaskSplit([{ summary: "x" }])).toThrow();
  });

  it("keeps only summary, description and component names", () => {
    const [item] = parseSubtaskSplit({
      items: [
        {
          summary: "Thêm\nnút  xuất",
          description: "Chi tiết",
          componentNames: ["Frontend"],
          labels: ["x"],
          workCategory: "debt",
          issueTypeName: "Bug",
        },
      ],
    });
    expect(item).toEqual({ summary: "Thêm nút xuất", description: "Chi tiết", componentNames: ["Frontend"] });
  });
});

describe("resolveSubtaskPlacement", () => {
  it("uses the default sub-task type under a normal task", () => {
    expect(resolveSubtaskPlacement(metadata, { issueTypeName: "Task", subtask: false })).toEqual({
      issueTypeId: "10003",
    });
  });

  it("refuses to split a sub-task", () => {
    expect(() => resolveSubtaskPlacement(metadata, { issueTypeName: "Sub-task", subtask: true })).toThrow(
      SubtaskSplitError
    );
  });

  it("detects a sub-task parent from metadata when Jira omits the flag", () => {
    expect(() => resolveSubtaskPlacement(metadata, { issueTypeId: "10003" })).toThrow(SubtaskSplitError);
  });

  it("uses a standard issue type under an epic", () => {
    expect(resolveSubtaskPlacement(metadata, { issueTypeName: "Epic", subtask: false })).toEqual({
      issueTypeId: "10001",
    });
    // Default type missing or itself an epic: first standard non-epic type.
    expect(
      resolveSubtaskPlacement({ ...metadata, defaultIssueTypeId: "10002" }, { issueTypeName: "epic" })
    ).toEqual({ issueTypeId: "10001" });
  });

  it("fails when the project has no sub-task type", () => {
    expect(() =>
      resolveSubtaskPlacement(
        { ...metadata, hasSubtaskTypes: false, defaultSubtaskTypeId: null },
        { issueTypeName: "Task" }
      )
    ).toThrow(SubtaskSplitError);
  });
});

describe("buildSubtaskSplitItems", () => {
  it("maps names to ids, links the parent and assigns unique row refs", () => {
    const { items, warnings } = buildSubtaskSplitItems(
      [
        { summary: "Làm giao diện", description: "UI", componentNames: ["frontend"] },
        { summary: "Làm API", componentNames: ["Unknown"] },
      ],
      metadata,
      { parentKey: "ABC-1", issueTypeId: "10003" }
    );
    expect(items).toEqual([
      {
        clientRef: "row-1",
        summary: "Làm giao diện",
        description: "UI",
        issueTypeId: "10003",
        parent: { type: "jira", jiraKey: "ABC-1" },
        componentIds: ["c1"],
      },
      {
        clientRef: "row-2",
        summary: "Làm API",
        issueTypeId: "10003",
        parent: { type: "jira", jiraKey: "ABC-1" },
      },
    ]);
    expect(warnings.map((w) => w.code)).toEqual(["UNKNOWN_COMPONENT"]);
  });
});
