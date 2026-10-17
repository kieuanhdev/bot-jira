import { describe, expect, it } from "vitest";
import type { BulkCreateProjectMetadata } from "@/lib/bulk/create-types";
import { normalizeAiDraftBatch } from "@/lib/bulk/ai-draft-normalizer";
import {
  MAX_IDEA_LENGTH,
  TASK_DRAFT_PROMPT_VERSION,
  buildTaskDraftPrefill,
  buildTaskDraftPrompt,
  parseTaskDraft,
  taskDraftPromptLists,
} from "./task-draft-prompt";

const metadata: Pick<BulkCreateProjectMetadata, "issueTypes" | "priorityOptions" | "components"> = {
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Bug", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
  priorityOptions: [
    { id: "1", name: "High" },
    { id: "2", name: "Medium" },
  ],
  components: [
    { id: "c1", name: "Frontend" },
    { id: "c2", name: "Report Service" },
  ],
};

describe("buildTaskDraftPrompt", () => {
  const base = {
    idea: "thêm nút xuất excel ở màn báo cáo",
    projectKey: "ABC",
    issueTypes: ["Task", "Bug"],
    priorities: ["High", "Medium"],
    components: ["Frontend", "Report Service"],
    labels: ["reporting", "ui"],
  };

  it("lists every allowed issue type, priority, component and label", () => {
    const prompt = buildTaskDraftPrompt(base);
    for (const name of [...base.issueTypes, ...base.priorities, ...base.components, ...base.labels]) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("ABC");
    expect(prompt).toContain(base.idea);
  });

  it("asks for JSON only with the expected keys and description sections", () => {
    const prompt = buildTaskDraftPrompt(base);
    for (const key of ["summary", "description", "issueTypeName", "priorityName", "componentNames", "labels"]) {
      expect(prompt).toContain(key);
    }
    expect(prompt).toContain("Bối cảnh");
    expect(prompt).toContain("Yêu cầu");
    expect(prompt).toContain("Tiêu chí chấp nhận");
    expect(prompt).toMatch(/JSON/);
  });

  it("allows a few new labels only when the project has no labels", () => {
    expect(buildTaskDraftPrompt(base)).not.toContain("tối đa 3 label");
    expect(buildTaskDraftPrompt({ ...base, labels: [] })).toContain("tối đa 3 label");
  });

  it("includes current summary/description when given and redacts secrets", () => {
    const prompt = buildTaskDraftPrompt({
      ...base,
      idea: "gọi api với token=abcdefghijklmnop123",
      current: { summary: "Tiêu đề cũ", description: "Mô tả cũ" },
    });
    expect(prompt).toContain("Tiêu đề cũ");
    expect(prompt).toContain("Mô tả cũ");
    expect(prompt).not.toContain("abcdefghijklmnop123");
  });

  it("truncates the idea to the max length", () => {
    const prompt = buildTaskDraftPrompt({ ...base, idea: "x".repeat(MAX_IDEA_LENGTH + 500) });
    expect(prompt).not.toContain("x".repeat(MAX_IDEA_LENGTH + 1));
  });

  it("exposes a prompt version", () => {
    expect(TASK_DRAFT_PROMPT_VERSION).toBe("task-draft-v1");
  });
});

describe("parseTaskDraft", () => {
  it("throws without a summary", () => {
    expect(() => parseTaskDraft({})).toThrow();
    expect(() => parseTaskDraft({ summary: "   " })).toThrow();
    expect(() => parseTaskDraft(null)).toThrow();
    expect(() => parseTaskDraft([])).toThrow();
  });

  it("returns the item with known keys", () => {
    expect(parseTaskDraft({ summary: "Sửa A", issueTypeName: "Task" })).toEqual({
      summary: "Sửa A",
      issueTypeName: "Task",
    });
  });

  it("collapses the summary to one line and drops unknown or malformed keys", () => {
    const item = parseTaskDraft({
      summary: "Thêm nút\n xuất Excel  ",
      description: "Bối cảnh\n- A",
      priorityName: 3,
      componentNames: ["Frontend", 7, " "],
      labels: "ui",
      points: 8,
      worklogs: [{}],
    });
    expect(item).toEqual({
      summary: "Thêm nút xuất Excel",
      description: "Bối cảnh\n- A",
      componentNames: ["Frontend"],
    });
  });
});

describe("taskDraftPromptLists", () => {
  it("excludes sub-task types and caps labels", () => {
    const labels = Array.from({ length: 80 }, (_, i) => `l${i}`);
    const lists = taskDraftPromptLists(metadata, labels);
    expect(lists.issueTypes).toEqual(["Task", "Bug"]);
    expect(lists.priorities).toEqual(["High", "Medium"]);
    expect(lists.components).toEqual(["Frontend", "Report Service"]);
    expect(lists.labels).toHaveLength(50);
  });
});

describe("normalizeAiDraftBatch with unknown names", () => {
  it("leaves component ids empty and warns when the component does not exist", () => {
    const res = normalizeAiDraftBatch({
      items: [{ summary: "Sửa A", componentNames: ["Foo"] }],
      metadata,
    });
    const item = res.items[0];
    expect(item.rowInput.componentIds).toEqual([]);
    expect(item.warnings.some((w) => w.code === "UNKNOWN_COMPONENT" && w.message.includes("Foo"))).toBe(true);
  });

  it("warns on unknown issue type and priority", () => {
    const res = normalizeAiDraftBatch({
      items: [{ summary: "Sửa A", issueTypeName: "Epic", priorityName: "Blocker" }],
      metadata,
    });
    const item = res.items[0];
    expect(item.rowInput.issueTypeId).toBeUndefined();
    expect(item.rowInput.priorityId).toBeUndefined();
    const codes = item.warnings.map((w) => w.code);
    expect(codes).toContain("UNKNOWN_ISSUE_TYPE");
    expect(codes).toContain("UNKNOWN_PRIORITY");
  });
});

describe("buildTaskDraftPrefill", () => {
  it("maps names to ids and returns only form fields", () => {
    const { prefill, warnings } = buildTaskDraftPrefill(
      {
        summary: "Thêm nút xuất Excel",
        description: "Bối cảnh\n- A",
        issueTypeName: "bug",
        priorityName: "High",
        componentNames: ["Report Service"],
        labels: ["Reporting"],
      },
      metadata,
      ["Reporting", "ui"]
    );
    expect(prefill).toEqual({
      summary: "Thêm nút xuất Excel",
      description: "Bối cảnh\n- A",
      issueTypeId: "10002",
      priorityId: "1",
      componentIds: ["c2"],
      labels: ["Reporting"],
    });
    expect(warnings).toEqual([]);
  });

  it("does not add policy labels or policy warnings", () => {
    const { prefill, warnings } = buildTaskDraftPrefill({ summary: "Sửa A" }, metadata, []);
    expect(prefill).toEqual({ summary: "Sửa A" });
    expect(prefill.labels).toBeUndefined();
    expect(warnings.some((w) => w.code?.startsWith("MISSING_"))).toBe(false);
  });

  it("refuses sub-task types and unknown names with warnings", () => {
    const { prefill, warnings } = buildTaskDraftPrefill(
      { summary: "Sửa A", issueTypeName: "Sub-task", componentNames: ["Foo", "Frontend"] },
      metadata,
      []
    );
    expect(prefill.issueTypeId).toBeUndefined();
    expect(prefill.componentIds).toEqual(["c1"]);
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("UNKNOWN_ISSUE_TYPE");
    expect(codes).toContain("UNKNOWN_COMPONENT");
  });

  it("drops labels outside the project list", () => {
    const { prefill, warnings } = buildTaskDraftPrefill(
      { summary: "Sửa A", labels: ["ui", "made-up"] },
      metadata,
      ["ui"]
    );
    expect(prefill.labels).toEqual(["ui"]);
    expect(warnings.some((w) => w.code === "UNKNOWN_LABEL" && w.message.includes("made-up"))).toBe(true);
  });

  it("keeps at most 3 new labels when the project has none", () => {
    const { prefill } = buildTaskDraftPrefill(
      { summary: "Sửa A", labels: ["a", "b", "c", "d"] },
      metadata,
      []
    );
    expect(prefill.labels).toEqual(["a", "b", "c"]);
  });
});
