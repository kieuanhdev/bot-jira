import { describe, it, expect } from "vitest";
import { normalizeStatusToGroup, isDoneGroup, isWipGroup } from "./status";

describe("normalizeStatusToGroup (Section 5.1, RPT-101)", () => {
  it("maps blocked statuses to Blocked", () => {
    expect(normalizeStatusToGroup("Blocked")).toBe("Blocked");
    expect(normalizeStatusToGroup("Waiting for external")).toBe("Blocked");
    expect(normalizeStatusToGroup("Stuck")).toBe("Blocked");
  });

  it("maps done statuses to Done", () => {
    expect(normalizeStatusToGroup("Done")).toBe("Done");
    expect(normalizeStatusToGroup("Closed")).toBe("Done");
    expect(normalizeStatusToGroup("Resolved")).toBe("Done");
    expect(normalizeStatusToGroup("Cancelled")).toBe("Done");
  });

  it("maps QA/testing statuses to QA/Test", () => {
    expect(normalizeStatusToGroup("Ready for QA")).toBe("QA/Test");
    expect(normalizeStatusToGroup("Testing in progress")).toBe("QA/Test");
    expect(normalizeStatusToGroup("UAT")).toBe("QA/Test");
  });

  it("maps review statuses to In Review", () => {
    expect(normalizeStatusToGroup("Code Review")).toBe("In Review");
    expect(normalizeStatusToGroup("Peer Review")).toBe("In Review");
    expect(normalizeStatusToGroup("PR")).toBe("In Review");
  });

  it("maps in-progress statuses to In Progress", () => {
    expect(normalizeStatusToGroup("In Progress")).toBe("In Progress");
    expect(normalizeStatusToGroup("Developing")).toBe("In Progress");
  });

  it("maps backlog and to-do statuses", () => {
    expect(normalizeStatusToGroup("Backlog")).toBe("Backlog");
    expect(normalizeStatusToGroup("Parked")).toBe("Backlog");
    expect(normalizeStatusToGroup("To Do")).toBe("To Do");
    expect(normalizeStatusToGroup("Open")).toBe("To Do");
    expect(normalizeStatusToGroup("Ready")).toBe("To Do");
  });

  it("falls back to statusCategory when name is unmapped", () => {
    expect(normalizeStatusToGroup("CustomDone123", "done")).toBe("Done");
    expect(normalizeStatusToGroup("CustomWork123", "indeterminate")).toBe("In Progress");
    expect(normalizeStatusToGroup("CustomNew123", "new")).toBe("To Do");
  });

  it("returns Unknown for unmappable statuses without guessing Done", () => {
    expect(normalizeStatusToGroup("xyz_unmapped_status", "undefined_cat")).toBe("Unknown");
    expect(normalizeStatusToGroup("", "")).toBe("Unknown");
  });

  it("checks group helpers", () => {
    expect(isDoneGroup("Done")).toBe(true);
    expect(isDoneGroup("In Progress")).toBe(false);
    expect(isWipGroup("In Progress")).toBe(true);
    expect(isWipGroup("In Review")).toBe(true);
    expect(isWipGroup("QA/Test")).toBe(true);
    expect(isWipGroup("To Do")).toBe(false);
  });
});
