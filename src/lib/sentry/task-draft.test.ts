import { describe, it, expect } from "vitest";
import { buildSentryTaskDraft } from "./task-draft";

describe("buildSentryTaskDraft", () => {
  it("builds the summary and description from a full row", () => {
    const draft = buildSentryTaskDraft({
      sentryIssueId: "933",
      shortId: "EASY-HRM-8S",
      title: "Boom",
      permalinkUrl: "https://sentry.example/issues/933/",
      level: "error",
      eventCount: 12,
      firstSeen: new Date("2026-07-10T05:22:30.000Z"),
      lastSeen: "2026-10-17T03:58:50.000Z",
    });
    expect(draft.summary).toBe("[Sentry] EASY-HRM-8S: Boom");
    expect(draft.issueType).toBe("Bug");
    expect(draft.description).toBe(
      [
        "Auto-created from Sentry.",
        "",
        "Sentry issue: https://sentry.example/issues/933/",
        "Level: error",
        "Count: 12",
        "First seen: 2026-07-10T05:22:30.000Z",
        "Last seen: 2026-10-17T03:58:50.000Z",
      ].join("\n")
    );
  });

  it("falls back for missing fields", () => {
    const draft = buildSentryTaskDraft({ sentryIssueId: "7" });
    expect(draft.summary).toBe("[Sentry] 7: Sentry issue");
    expect(draft.description).toContain("Sentry issue: 7");
    expect(draft.description).toContain("Level: unknown");
    expect(draft.description).toContain("Count: n/a");
    expect(draft.description).toContain("First seen: n/a");
  });
});
