import { describe, expect, it, vi } from "vitest";
import { buildQueueDefinitions, JOB_NAMES } from "./job-names";
import { buildScheduleDefinitions, pollCron, registerSchedules } from "./schedules";

describe("queue registry contract", () => {
  it("keeps the complete ordered job catalog and queue options", () => {
    expect(buildQueueDefinitions({
      jiraSyncExpireSeconds: 900,
      jiraHeartbeatSeconds: 30,
    })).toEqual([
      { name: "poll-jira-dispatch", createOptions: { policy: "singleton" }, updateOptions: { notify: true, expireInSeconds: 60 } },
      { name: "poll-jira-project", createOptions: { policy: "stately" }, updateOptions: { notify: true, expireInSeconds: 900, heartbeatSeconds: 30 } },
      { name: "poll-jira", createOptions: { policy: "singleton" }, updateOptions: { notify: true, expireInSeconds: 300 } },
      { name: "poll-watched-issues", createOptions: { policy: "singleton" }, updateOptions: { notify: true, expireInSeconds: 30 } },
      { name: "refresh-board-membership", updateOptions: { notify: true, expireInSeconds: 180 } },
      { name: "check-branches", updateOptions: { notify: true, expireInSeconds: 300 } },
      { name: "parse-comment-branches", updateOptions: { notify: true, expireInSeconds: 120 } },
      { name: "poll-pr-comments", updateOptions: { notify: true, expireInSeconds: 180 } },
      { name: "ai-score", updateOptions: { notify: true, expireInSeconds: 300 } },
      { name: "sentry-import", updateOptions: { notify: true, expireInSeconds: 120 } },
      { name: "stale-detect", updateOptions: { notify: true, expireInSeconds: 300 } },
      { name: "bulk-op", updateOptions: { notify: true, expireInSeconds: 3600 } },
      { name: "process-webhook", updateOptions: { notify: true, expireInSeconds: 120 } },
      { name: "deliver-notifications", updateOptions: { notify: true, expireInSeconds: 60 } },
      { name: "health-alert", updateOptions: { notify: true, expireInSeconds: 60 } },
      { name: "capture-project-report-snapshots", updateOptions: { notify: true, expireInSeconds: 300 } },
      { name: "detect-people-fields", updateOptions: { notify: true, expireInSeconds: 300 } },
    ]);
    expect(JOB_NAMES).toHaveLength(17);
  });
});

describe("queue schedule contract", () => {
  it("keeps cron, singleton, expiry, and retry options unchanged", () => {
    expect(buildScheduleDefinitions(5 * 60_000)).toEqual([
      { name: "poll-jira-dispatch", cron: "*/5 * * * *", options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 2, retryDelay: 5 } },
      { name: "check-branches", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
      { name: "parse-comment-branches", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 120, retryLimit: 2, retryDelay: 30 } },
      { name: "poll-pr-comments", cron: "*/15 * * * *", options: { singletonSeconds: 840, expireInSeconds: 900, retryLimit: 1, retryDelay: 30 } },
      { name: "ai-score", cron: "*/10 * * * *", options: { singletonSeconds: 540, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
      { name: "sentry-import", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 120, retryLimit: 3, retryDelay: 30, retryBackoff: true } },
      { name: "stale-detect", cron: "*/30 * * * *", options: { singletonSeconds: 1740, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
      { name: "deliver-notifications", cron: "* * * * *", options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 3, retryDelay: 15, retryBackoff: true } },
      { name: "health-alert", cron: "* * * * *", options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 2, retryDelay: 10 } },
      { name: "capture-project-report-snapshots", cron: "15 0 * * *", options: { singletonSeconds: 3600, expireInSeconds: 1800, retryLimit: 2, retryDelay: 60 } },
      { name: "detect-people-fields", cron: "30 1 * * *", options: { singletonSeconds: 3600, expireInSeconds: 1800, retryLimit: 2, retryDelay: 60 } },
    ]);
  });

  it("preserves the bounded Jira poll cron conversion", () => {
    expect(pollCron(1)).toBe("* * * * *");
    expect(pollCron(90_000)).toBe("*/2 * * * *");
    expect(pollCron(90 * 60_000)).toBe("*/59 * * * *");
  });

  it("still registers every schedule when legacy unscheduling fails", async () => {
    const boss = {
      unschedule: vi.fn().mockRejectedValue(new Error("legacy schedule missing")),
      schedule: vi.fn().mockResolvedValue(undefined),
    };

    await registerSchedules(boss, 5 * 60_000);

    expect(boss.unschedule).toHaveBeenCalledWith("poll-jira");
    expect(boss.schedule).toHaveBeenCalledTimes(11);
    expect(boss.schedule).toHaveBeenNthCalledWith(
      1,
      "poll-jira-dispatch",
      "*/5 * * * *",
      null,
      { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 2, retryDelay: 5 }
    );
  });
});
