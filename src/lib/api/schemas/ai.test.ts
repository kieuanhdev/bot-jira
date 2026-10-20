import { describe, expect, it } from "vitest";
import { SubtaskSplitBodySchema, TaskDraftBodySchema } from "./ai";

describe("TaskDraftBodySchema", () => {
  it("accepts an idea with a null current", () => {
    expect(TaskDraftBodySchema.safeParse({ projectKey: "ABC", idea: "x", current: null }).success).toBe(true);
  });
  it("rejects a non-string idea", () => {
    expect(TaskDraftBodySchema.safeParse({ idea: 5 }).success).toBe(false);
  });
});

describe("SubtaskSplitBodySchema", () => {
  it("accepts keys", () => {
    expect(SubtaskSplitBodySchema.safeParse({ projectKey: "ABC", parentKey: "ABC-1" }).success).toBe(true);
  });
  it("rejects a non-string parentKey", () => {
    expect(SubtaskSplitBodySchema.safeParse({ parentKey: 1 }).success).toBe(false);
  });
});
