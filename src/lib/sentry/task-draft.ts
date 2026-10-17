// The Jira task a Sentry issue becomes. Shared by the import worker (which files
// it) and the admin review dialog (which previews it) so the two never drift.

export type SentryTaskSource = {
  sentryIssueId: string;
  shortId?: string | null;
  title?: string | null;
  permalinkUrl?: string | null;
  level?: string | null;
  eventCount?: number | null;
  firstSeen?: Date | string | null;
  lastSeen?: Date | string | null;
};

export type SentryTaskDraft = {
  summary: string;
  description: string;
  issueType: "Bug";
};

function iso(value: Date | string | null | undefined): string {
  if (!value) return "n/a";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "n/a" : d.toISOString();
}

export function buildSentryTaskDraft(row: SentryTaskSource): SentryTaskDraft {
  const ref = row.shortId ?? row.sentryIssueId;
  return {
    summary: `[Sentry] ${ref}: ${row.title ?? "Sentry issue"}`,
    description: [
      "Auto-created from Sentry.",
      "",
      `Sentry issue: ${row.permalinkUrl ?? ref}`,
      `Level: ${row.level ?? "unknown"}`,
      `Count: ${row.eventCount ?? "n/a"}`,
      `First seen: ${iso(row.firstSeen)}`,
      `Last seen: ${iso(row.lastSeen)}`,
    ].join("\n"),
    issueType: "Bug",
  };
}
