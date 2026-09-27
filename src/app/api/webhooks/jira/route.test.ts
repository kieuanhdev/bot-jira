import { describe, expect, it } from "vitest";
import { jiraExternalId, jiraSubject, jiraType } from "./route";

describe("Jira webhook normalization", () => {
  it("supports the standard Jira webhook payload", () => {
    const payload = {
      timestamp: 1790470800000,
      webhookEvent: "jira:issue_updated",
      issue: { key: "EPM-42", fields: { updated: "2026-09-27T08:00:00.000+0700" } },
      changelog: {
        id: "change-123",
        items: [{ field: "status", from: "1", to: "3" }],
      },
    };

    expect(jiraType(payload)).toBe("jira:issue_updated");
    expect(jiraSubject(payload)).toBe("EPM-42");
    expect(jiraExternalId(payload)).toContain("change-123");
  });

  it("does not collapse two separate comments on the same issue", () => {
    const base = {
      webhookEvent: "jira:issue_commented",
      issue: { key: "EPM-42" },
    };
    expect(jiraExternalId({ ...base, comment: { id: "100" } }))
      .not.toBe(jiraExternalId({ ...base, comment: { id: "101" } }));
  });
});
