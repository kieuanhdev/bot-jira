import { describe, it, expect } from "vitest";
import { evaluateBranchAttention, hasAttentionSignal } from "./branch-risk";

describe("evaluateBranchAttention", () => {
  it("flags High when task is Done but PR is OPEN", () => {
    const signals = evaluateBranchAttention({
      jiraKey: "EPM-100",
      taskStatus: "Done",
      taskStatusCategory: "done",
      prState: "OPEN",
    });
    expect(signals.some((s) => s.rule === "task_done_pr_open" && s.severity === "high")).toBe(true);
    expect(hasAttentionSignal({
      jiraKey: "EPM-100",
      taskStatusCategory: "done",
      prState: "OPEN",
    })).toBe(true);
  });

  it("flags Medium when PR is MERGED but task is not Done", () => {
    const signals = evaluateBranchAttention({
      jiraKey: "EPM-100",
      taskStatus: "In Progress",
      taskStatusCategory: "indeterminate",
      prState: "MERGED",
      merged: true,
    });
    expect(signals.some((s) => s.rule === "pr_merged_task_not_done" && s.severity === "medium")).toBe(true);
  });

  it("flags Medium when task is active (indeterminate) but has no PR", () => {
    const signals = evaluateBranchAttention({
      jiraKey: "EPM-100",
      taskStatus: "In Progress",
      taskStatusCategory: "indeterminate",
      prState: null,
    });
    expect(signals.some((s) => s.rule === "task_active_no_pr" && s.severity === "medium")).toBe(true);
  });

  it("flags Low when branch has a suggestion pending review", () => {
    const signals = evaluateBranchAttention({
      suggestedJiraKey: "EPM-100",
    });
    expect(signals.some((s) => s.rule === "link_suggested" && s.severity === "low")).toBe(true);
  });

  it("flags Info when branch has no task linkage", () => {
    const signals = evaluateBranchAttention({});
    expect(signals.some((s) => s.rule === "unlinked" && s.severity === "info")).toBe(true);
  });

  it("flags High on sync errors or stale data", () => {
    const signals = evaluateBranchAttention({
      syncError: "Bitbucket 503 Service Unavailable",
    });
    expect(signals.some((s) => s.rule === "sync_error" && s.severity === "high")).toBe(true);
  });
});
