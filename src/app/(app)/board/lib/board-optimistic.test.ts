import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyOptimisticIssuePatch } from "./board-optimistic";
import { issuesKeys } from "@/lib/query-keys";
import type { IssueItem, IssueSuccessResponse } from "@/hooks/use-issues";
import type { QuickPanelDetail } from "./board-types";

describe("applyOptimisticIssuePatch", () => {
  function makeSampleIssue(overrides: Partial<IssueItem> = {}): IssueItem {
    return {
      jiraKey: "TEST-1",
      projectKey: "TEST",
      summary: "Test summary",
      description: "Test description",
      status: "To Do",
      statusCategory: "new",
      statusChangedAt: null,
      assigneeJira: "alice",
      reporterJira: "bob",
      approverJira: null,
      testerJira: null,
      labels: ["frontend"],
      fixVersionIds: [],
      fixVersionNames: ["v1.0"],
      priority: "Medium",
      points: 3,
      type: "Task",
      dueDate: null,
      timeSpent: null,
      originalEstimateSeconds: null,
      createdAt: null,
      updatedAt: null,
      lastSyncedAt: new Date().toISOString(),
      aiScore: null,
      aiDecision: null,
      ...overrides,
    };
  }

  function makeSampleDetail(overrides: Partial<QuickPanelDetail> = {}): QuickPanelDetail {
    return {
      summary: "Test summary",
      description: "Test description",
      status: "To Do",
      assigneeJira: "alice",
      reporterJira: "bob",
      approverJira: null,
      testerJira: null,
      dueDate: null,
      timeSpentSeconds: null,
      originalEstimateSeconds: null,
      labels: ["frontend"],
      priority: "Medium",
      points: 3,
      type: "Task",
      createdAt: null,
      updatedAt: null,
      lastSyncedAt: new Date().toISOString(),
      aiScore: null,
      aiDecision: null,
      staleSnapshots: [],
      comments: [],
      releaseTasks: [],
      fixVersions: ["v1.0"],
      ...overrides,
    };
  }

  it("updates points immediately in both detail and list caches", () => {
    const qc = new QueryClient();
    const detailKey = issuesKeys.detail("TEST-1");
    const listKey = issuesKeys.list("project=TEST");

    qc.setQueryData(detailKey, { issue: makeSampleDetail({ points: 3 }) });
    qc.setQueryData(listKey, {
      items: [makeSampleIssue({ jiraKey: "TEST-1", points: 3 })],
      total: 1,
      sync: { projects: ["TEST"], lastSuccessAt: null, stale: false, freshnessMinutes: 0, errors: [] },
    } as IssueSuccessResponse);

    const rollback = applyOptimisticIssuePatch(qc, "TEST-1", { points: 8 });

    // Verify detail query updated
    const updatedDetail = qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey);
    expect(updatedDetail?.issue.points).toBe(8);

    // Verify list query updated
    const updatedList = qc.getQueryData<IssueSuccessResponse>(listKey);
    expect(updatedList?.items[0].points).toBe(8);

    // Rollback test
    rollback();
    expect(qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey)?.issue.points).toBe(3);
    expect(qc.getQueryData<IssueSuccessResponse>(listKey)?.items[0].points).toBe(3);
  });

  it("handles clearing points to null", () => {
    const qc = new QueryClient();
    const detailKey = issuesKeys.detail("TEST-1");
    const listKey = issuesKeys.list("project=TEST");

    qc.setQueryData(detailKey, { issue: makeSampleDetail({ points: 5 }) });
    qc.setQueryData(listKey, {
      items: [makeSampleIssue({ jiraKey: "TEST-1", points: 5 })],
      total: 1,
      sync: { projects: ["TEST"], lastSuccessAt: null, stale: false, freshnessMinutes: 0, errors: [] },
    } as IssueSuccessResponse);

    applyOptimisticIssuePatch(qc, "TEST-1", { points: null });

    expect(qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey)?.issue.points).toBeNull();
    expect(qc.getQueryData<IssueSuccessResponse>(listKey)?.items[0].points).toBeNull();
  });

  it("updates assignee and priority immediately", () => {
    const qc = new QueryClient();
    const detailKey = issuesKeys.detail("TEST-1");
    const listKey = issuesKeys.list("project=TEST");

    qc.setQueryData(detailKey, { issue: makeSampleDetail() });
    qc.setQueryData(listKey, {
      items: [makeSampleIssue()],
      total: 1,
      sync: { projects: ["TEST"], lastSuccessAt: null, stale: false, freshnessMinutes: 0, errors: [] },
    } as IssueSuccessResponse);

    applyOptimisticIssuePatch(qc, "TEST-1", { assignee: "charlie", priority: "Highest" });

    const updatedDetail = qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey);
    expect(updatedDetail?.issue.assigneeJira).toBe("charlie");
    expect(updatedDetail?.issue.priority).toBe("Highest");

    const updatedList = qc.getQueryData<IssueSuccessResponse>(listKey);
    expect(updatedList?.items[0].assigneeJira).toBe("charlie");
    expect(updatedList?.items[0].priority).toBe("Highest");
  });

  it("initializes detail cache from fallback issue if detail not yet loaded", () => {
    const qc = new QueryClient();
    const detailKey = issuesKeys.detail("TEST-2");

    const sample = makeSampleIssue({ jiraKey: "TEST-2", points: 1 });
    applyOptimisticIssuePatch(qc, "TEST-2", { points: 5 }, sample);

    const detail = qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey);
    expect(detail).toBeDefined();
    expect(detail?.issue.points).toBe(5);
    expect(detail?.issue.summary).toBe("Test summary");
  });
});
