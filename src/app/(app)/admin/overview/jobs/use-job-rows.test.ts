import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useJobRows, type ExtendedJobState, type JobFilter } from "./use-job-rows";

function TestJobRowsComponent({
  jobs,
  failingJobs,
  runningJobs,
  stuckJobs,
  jobFilter,
  onResult,
}: {
  jobs: ExtendedJobState[];
  failingJobs: ExtendedJobState[];
  runningJobs: string[];
  stuckJobs: string[];
  jobFilter: JobFilter;
  onResult: (res: ReturnType<typeof useJobRows>) => void;
}) {
  const result = useJobRows({
    jobs,
    failingJobs,
    runningJobs,
    stuckJobs,
    jobFilter,
    now: 1000000,
  });
  onResult(result);
  return React.createElement("div", null, result.rows.length.toString());
}

describe("useJobRows", () => {
  const sampleJobs: ExtendedJobState[] = [
    {
      job: "poll-jira",
      lastStartedAt: "2026-10-16T10:00:00Z",
      lastSuccessAt: "2026-10-16T10:05:00Z",
      lastErrorAt: null,
      lastError: null,
    },
    {
      job: "check-branches",
      lastStartedAt: "2026-10-16T09:00:00Z",
      lastSuccessAt: null,
      lastErrorAt: "2026-10-16T09:02:00Z",
      lastError: "Connection timeout",
    },
    {
      job: "ai-score",
      lastStartedAt: "2026-10-16T08:00:00Z",
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
    },
  ];

  it("computes flags with O(1) Set lookups accurately", () => {
    let hookResult = {} as ReturnType<typeof useJobRows>;
    renderToString(
      React.createElement(TestJobRowsComponent, {
        jobs: sampleJobs,
        failingJobs: [sampleJobs[1]],
        runningJobs: ["poll-jira"],
        stuckJobs: [],
        jobFilter: "all",
        onResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.counts.all).toBe(3);
    expect(hookResult.counts.failing).toBe(1);
    expect(hookResult.counts.running).toBe(1);
    expect(hookResult.counts.never).toBe(1);

    const jiraRow = hookResult.rows.find((r) => r.job === "poll-jira");
    expect(jiraRow?.isRunning).toBe(true);
    expect(jiraRow?.isFailing).toBe(false);

    const branchRow = hookResult.rows.find((r) => r.job === "check-branches");
    expect(branchRow?.isFailing).toBe(true);
    expect(branchRow?.isRunning).toBe(false);
  });

  it("filters jobs properly by failing filter", () => {
    let hookResult = {} as ReturnType<typeof useJobRows>;
    renderToString(
      React.createElement(TestJobRowsComponent, {
        jobs: sampleJobs,
        failingJobs: [sampleJobs[1]],
        runningJobs: [],
        stuckJobs: [],
        jobFilter: "failing",
        onResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.rows.length).toBe(1);
    expect(hookResult.rows[0].job).toBe("check-branches");
  });

  it("filters jobs properly by never filter", () => {
    let hookResult = {} as ReturnType<typeof useJobRows>;
    renderToString(
      React.createElement(TestJobRowsComponent, {
        jobs: sampleJobs,
        failingJobs: [],
        runningJobs: [],
        stuckJobs: [],
        jobFilter: "never",
        onResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.rows.length).toBe(1);
    expect(hookResult.rows[0].job).toBe("ai-score");
  });
});
