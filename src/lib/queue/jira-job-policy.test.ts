import { describe, expect, it } from "vitest";
import {
  scheduledJiraJobAgeMs,
  shouldSkipStaleJiraJob,
} from "./jira-job-policy";

const now = new Date("2026-09-30T08:00:00.000Z").getTime();

describe("Jira job backlog policy", () => {
  it("skips a scheduled job using the server requestedAt timestamp", () => {
    const data = {
      projectKey: "CICM",
      full: false,
      source: "schedule" as const,
      requestedAt: "2026-09-30T07:57:00.000Z",
    };

    expect(scheduledJiraJobAgeMs(data, {}, now)).toBe(3 * 60_000);
    expect(shouldSkipStaleJiraJob(data, {}, now)).toBe(true);
  });

  it("falls back to pg-boss metadata for a legacy job", () => {
    const data = {
      projectKey: "CICM",
      full: false,
      source: "startup" as const,
      requestedAt: "invalid",
    };

    expect(shouldSkipStaleJiraJob(data, { createdOn: "2026-09-30T07:57:30.000Z" }, now)).toBe(true);
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
