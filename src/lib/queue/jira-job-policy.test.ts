import { describe, expect, it } from "vitest";
import {
  scheduledJiraJobAgeMs,
  shouldSkipStaleJiraJob,
} from "./jira-job-policy";

const now = new Date("2026-09-30T08:00:00.000Z").getTime();

describe("Jira job backlog policy", () => {
  it("calculates job age using requestedAt timestamp", () => {
    const data = {
      projectKey: "CICM",
      full: false,
      source: "schedule" as const,
      requestedAt: "2026-09-30T07:57:00.000Z",
    };

    expect(scheduledJiraJobAgeMs(data, {}, now)).toBe(3 * 60_000);
  });

  it("calculates job age falling back to pg-boss metadata for legacy jobs", () => {
    const data = {
      projectKey: "CICM",
      full: false,
      source: "startup" as const,
      requestedAt: "",
    };

    expect(scheduledJiraJobAgeMs(data, { createdOn: "2026-09-30T07:57:30.000Z" }, now)).toBe(150_000);
  });

  it("does not drop retrying or older scheduled jobs, preserving retry queue execution", () => {
    const data = {
      projectKey: "CICM",
      full: false,
      source: "schedule" as const,
      requestedAt: "2026-09-30T07:50:00.000Z", // 10 minutes ago (e.g. retried multiple times)
    };

    // Stately queue policy + singletonKey prevents queue bloat, so retries are preserved
    expect(shouldSkipStaleJiraJob(data, {}, now)).toBe(false);
  });

  it.each(["manual", "admin", "recovery"] as const)("never drops a %s request as backlog", (source) => {
    const data = {
      projectKey: "CICM",
      full: false,
      source,
      requestedAt: "2026-09-30T07:00:00.000Z",
    };

    expect(shouldSkipStaleJiraJob(data, {}, now)).toBe(false);
  });
});
