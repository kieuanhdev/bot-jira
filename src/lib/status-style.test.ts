import { describe, it, expect } from "vitest";
import {
  STATUS_CATEGORY_STYLE,
  CATEGORY_DOTS,
  CATEGORY_TEXT,
  GROUP_DOT,
  CATEGORY_DOT_MAP,
  getCategoryDot,
  getCategoryBadgeVariant,
} from "./status-style";
import { statusGroup, classifyStatusCategory } from "./status-groups";
import { categoryFromLabel } from "./jira/board-config";
import { inferCategoryFromLabel } from "./jira/project-workflow-store";
import { categoryOf } from "@/app/(app)/bulk/lib/bulk-utils";

describe("status style constants and helpers", () => {
  it("provides canonical CATEGORY_DOTS and CATEGORY_TEXT", () => {
    expect(CATEGORY_DOTS.new).toBeDefined();
    expect(CATEGORY_DOTS.indeterminate).toBeDefined();
    expect(CATEGORY_DOTS.done).toBeDefined();

    expect(CATEGORY_TEXT.new).toBe("text-info");
    expect(CATEGORY_TEXT.indeterminate).toBe("text-primary");
    expect(CATEGORY_TEXT.done).toBe("text-success");

    expect(STATUS_CATEGORY_STYLE.new.badgeVariant).toBe("info");
    expect(STATUS_CATEGORY_STYLE.indeterminate.badgeVariant).toBe("secondary");
    expect(STATUS_CATEGORY_STYLE.done.badgeVariant).toBe("success");
  });

  it("provides GROUP_DOT matching status group colors", () => {
    expect(GROUP_DOT.Backlog).toBe("bg-muted-foreground/50");
    expect(GROUP_DOT["To Do"]).toBe("bg-info");
    expect(GROUP_DOT["In Progress"]).toBe("bg-primary");
    expect(GROUP_DOT["In Review"]).toBe("bg-warning");
    expect(GROUP_DOT.Done).toBe("bg-success");
  });

  it("provides CATEGORY_DOT_MAP matching legacy board map", () => {
    expect(CATEGORY_DOT_MAP.new).toBe("bg-slate-400");
    expect(CATEGORY_DOT_MAP.indeterminate).toBe("bg-amber-400");
    expect(CATEGORY_DOT_MAP.done).toBe("bg-emerald-500");
  });

  it("getCategoryDot and getCategoryBadgeVariant return appropriate styles", () => {
    expect(getCategoryDot("new", 0)).toBe(CATEGORY_DOTS.new[0]);
    expect(getCategoryDot("done", 1)).toBe(CATEGORY_DOTS.done[1]);
    expect(getCategoryBadgeVariant("new")).toBe("info");
    expect(getCategoryBadgeVariant("indeterminate")).toBe("secondary");
    expect(getCategoryBadgeVariant("done")).toBe("success");
  });
});

describe("characterization: status categorization functions", () => {
  it("statusGroup maps status labels to 5 fixed groups", () => {
    expect(statusGroup("Done")).toBe("Done");
    expect(statusGroup("Closed")).toBe("Done");
    expect(statusGroup("In Review")).toBe("In Review");
    expect(statusGroup("QA Testing")).toBe("In Review");
    expect(statusGroup("In Progress")).toBe("In Progress");
    expect(statusGroup("Backlog")).toBe("Backlog");
    expect(statusGroup("To Do")).toBe("To Do");
    expect(statusGroup("Open")).toBe("To Do");
    expect(statusGroup("")).toBe("To Do");
  });

  it("categoryOf (bulk) categorizes statuses", () => {
    expect(categoryOf("Anything", "done")).toBe("done");
    expect(categoryOf("Anything", "indeterminate")).toBe("indeterminate");
    expect(categoryOf("Anything", "new")).toBe("new");
    expect(categoryOf("Closed")).toBe("done");
    expect(categoryOf("In Review")).toBe("indeterminate");
    expect(categoryOf("In Progress")).toBe("indeterminate");
    expect(categoryOf("To Do")).toBe("new");
  });

  it("confirms divergence pending D9: categoryFromLabel vs inferCategoryFromLabel", () => {
    // Both agree on done
    expect(categoryFromLabel("Done")).toBe("done");
    expect(inferCategoryFromLabel("Done")).toBe("done");

    // Both agree on in progress
    expect(categoryFromLabel("In Progress")).toBe("indeterminate");
    expect(inferCategoryFromLabel("In Progress")).toBe("indeterminate");

    // DIVERGENT BY DESIGN pending D9: "In Review" is "new" in board-config, but "indeterminate" in workflow-store
    expect(categoryFromLabel("In Review")).toBe("new");
    expect(inferCategoryFromLabel("In Review")).toBe("indeterminate");

    expect(categoryFromLabel("QA")).toBe("new");
    expect(inferCategoryFromLabel("QA")).toBe("indeterminate");
  });

  it("classifyStatusCategory respects modes", () => {
    expect(classifyStatusCategory("In Review", { mode: "board" })).toBe("new");
    expect(classifyStatusCategory("In Review", { mode: "workflow" })).toBe("indeterminate");
    expect(classifyStatusCategory("In Review", { mode: "standard" })).toBe("indeterminate");
  });
});
