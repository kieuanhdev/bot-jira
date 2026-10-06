import { describe, it, expect } from "vitest";
import {
  normalizeWorkflowCategory,
  inferCategoryFromLabel,
  getWorkflowRank,
  getCategoryPriority,
} from "./project-workflow-store";

describe("project-workflow-store", () => {
  it("normalizes categories correctly", () => {
    expect(normalizeWorkflowCategory("Done")).toBe("done");
    expect(normalizeWorkflowCategory("indeterminate")).toBe("indeterminate");
    expect(normalizeWorkflowCategory("in_progress")).toBe("indeterminate");
    expect(normalizeWorkflowCategory("new")).toBe("new");
    expect(normalizeWorkflowCategory("todo")).toBe("new");
    expect(normalizeWorkflowCategory("something_else")).toBe("unknown");
  });

  it("infers category from label", () => {
    expect(inferCategoryFromLabel("Closed")).toBe("done");
    expect(inferCategoryFromLabel("In Progress")).toBe("indeterminate");
    expect(inferCategoryFromLabel("Code Review")).toBe("indeterminate");
    expect(inferCategoryFromLabel("To Do")).toBe("new");
    expect(inferCategoryFromLabel("Backlog")).toBe("new");
    expect(inferCategoryFromLabel("Random State")).toBe("unknown");
  });

  it("assigns workflow ranks logically", () => {
    expect(getWorkflowRank("Backlog", "new")).toBeLessThan(getWorkflowRank("To Do", "new"));
    expect(getWorkflowRank("In Progress", "indeterminate")).toBeLessThan(getWorkflowRank("Testing", "indeterminate"));
    expect(getWorkflowRank("Done", "done")).toBeLessThan(getWorkflowRank("Closed", "done"));
  });

  it("prioritizes categories: new -> indeterminate -> done -> unknown", () => {
    expect(getCategoryPriority("new")).toBe(1);
    expect(getCategoryPriority("indeterminate")).toBe(2);
    expect(getCategoryPriority("done")).toBe(3);
    expect(getCategoryPriority("unknown")).toBe(4);
  });
});
