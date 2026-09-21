import { describe, expect, it } from "vitest";
import { issueCacheData } from "./cache";
import type { JiraIssue } from "@/lib/jira/types";

function issue(fields: JiraIssue["fields"]): JiraIssue {
  return { id: "10001", key: "EPM-123", self: "https://jira/issue/10001", fields };
}

describe("issueCacheData", () => {
  it("normalizes Jira source fields into the shared read model", () => {
    const data = issueCacheData(issue({
      project: { key: "EPM" },
      summary: "Release gate",
      description: "Acceptance criteria",
      status: { name: "In Review", statusCategory: { key: "indeterminate" } },
      statuscategorychangedate: "2026-09-19T04:05:00.000+0000",
      assignee: { name: "alice" },
      labels: ["mobile"],
      fixVersions: [{ id: "42", name: "1.4.2" }],
      priority: { name: "Critical" },
      issuetype: { name: "Bug" },
      created: "2026-09-18T04:05:00.000+0000",
      updated: "2026-09-19T04:05:00.000+0000",
    }));

    expect(data).toMatchObject({
      projectKey: "EPM",
      summary: "Release gate",
      status: "In Review",
      statusCategory: "indeterminate",
      assigneeJira: "alice",
      labels: ["mobile"],
      fixVersionIds: ["42"],
      fixVersionNames: ["1.4.2"],
      priority: "Critical",
      type: "Bug",
      deletedAt: null,
    });
    expect(data.statusChangedAt?.toISOString()).toBe("2026-09-19T04:05:00.000Z");
  });

  it("fails closed to unknown when Jira omits status category", () => {
    const data = issueCacheData(issue({ status: { name: "Custom state" } }));
    expect(data.statusCategory).toBe("unknown");
    expect(data.projectKey).toBe("EPM");
  });
});
