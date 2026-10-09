import { describe, expect, it } from "vitest";
import { issueCacheData } from "./cache";
import { setEpicLinkFieldIds } from "./epic";
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
      status: { id: "10020", name: "In Review", statusCategory: { key: "indeterminate" } },
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
      statusId: "10020",
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

  it("parses dueDate and timeSpent when present", () => {
    const data = issueCacheData(issue({
      project: { key: "EPM" },
      duedate: "2026-10-01T00:00:00.000+0000",
      timespent: 7200,
    }));
    expect(data.dueDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(data.timeSpent).toBe(7200);
  });

  it("maps reporter, approver, tester and epic fields", () => {
    setEpicLinkFieldIds(["customfield_10008"]);
    const data = issueCacheData(issue({
      project: { key: "EPM" },
      reporter: { name: "reporter_mb" },
      customfield_10300: { name: "approver" },
      customfield_10501: { name: "tester" },
      customfield_10008: "EPM-9",
    }));
    expect(data).toMatchObject({
      reporterJira: "reporter_mb",
      approverJira: "approver",
      testerJira: "tester",
      epicKey: "EPM-9",
    });
  });

  it("supports project-specific people field ids and null values", () => {
    const data = issueCacheData(issue({
      reporter: null,
      customfield_20001: { name: "custom-approver" },
      customfield_20002: null,
    }), { reporter: "reporter", approver: "customfield_20001", tester: "customfield_20002" });
    expect(data.reporterJira).toBeNull();
    expect(data.approverJira).toBe("custom-approver");
    expect(data.testerJira).toBeNull();
  });

  it("keeps default approver and tester fields when project overrides are null", () => {
    const data = issueCacheData(
      issue({
        customfield_10300: { name: "default-approver" },
        customfield_10501: { name: "default-tester" },
      }),
      { reporter: "reporter", approver: null, tester: null }
    );

    expect(data.approverJira).toBe("default-approver");
    expect(data.testerJira).toBe("default-tester");
  });

  it("defaults dueDate and timeSpent to null when absent", () => {
    const data = issueCacheData(issue({ project: { key: "EPM" } }));
    expect(data.dueDate).toBeNull();
    expect(data.timeSpent).toBeNull();
  });

  it("fails closed to unknown when Jira omits status category", () => {
    const data = issueCacheData(issue({ status: { name: "Custom state" } }));
    expect(data.statusCategory).toBe("unknown");
    expect(data.projectKey).toBe("EPM");
  });

  it("parses originalEstimateSeconds from timeoriginalestimate or timetracking", () => {
    const numData = issueCacheData(issue({ project: { key: "EPM" }, timeoriginalestimate: 14400 }));
    expect(numData.originalEstimateSeconds).toBe(14400);

    const trackingData = issueCacheData(issue({
      project: { key: "EPM" },
      timetracking: { originalEstimateSeconds: 28800 } as Record<string, unknown>,
    }));
    expect(trackingData.originalEstimateSeconds).toBe(28800);

    const strData = issueCacheData(issue({ project: { key: "EPM" }, timeoriginalestimate: "3600" as unknown as number }));
    expect(strData.originalEstimateSeconds).toBe(3600);

    const emptyData = issueCacheData(issue({ project: { key: "EPM" } }));
    expect(emptyData.originalEstimateSeconds).toBeNull();
  });

  it("only treats a parent as epic when its type is Epic", () => {
    setEpicLinkFieldIds([]);
    const sub = issueCacheData(issue({ parent: { key: "EPM-5", fields: { issuetype: { name: "Story" } } } }));
    const epic = issueCacheData(issue({ parent: { key: "EPM-6", fields: { issuetype: { name: "Epic" } } } }));
    expect(sub.epicKey).toBeNull();
    expect(epic.epicKey).toBe("EPM-6");
  });
});
