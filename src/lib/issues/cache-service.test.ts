import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraIssue } from "@/lib/jira/types";
import {
  createIssueCacheRefreshService,
  issueCacheData,
} from "./cache-service";

vi.mock("@/lib/jira/people-fields", () => ({
  DEFAULT_PEOPLE_FIELDS: {
    reporter: "reporter",
    approver: "customfield_10300",
    tester: "customfield_10501",
  },
  getProjectPeopleFields: vi.fn().mockResolvedValue({
    reporter: "reporter",
    approver: "customfield_10300",
    tester: "customfield_10501",
  }),
  jiraIssueFieldsForProject: vi.fn().mockResolvedValue("summary,status,updated"),
}));

vi.mock("@/lib/jira/client", () => ({
  jiraPointsFromFields: () => ({ points: null, fieldId: null }),
  parseJiraDate: (value?: string) => (value ? new Date(value) : undefined),
}));

function issue(updated: string): JiraIssue {
  return {
    id: "10001",
    key: "EPM-1",
    self: "https://jira/issue/10001",
    fields: {
      project: { key: "EPM" },
      summary: "Updated summary",
      status: { name: "In Progress" },
      updated,
    },
  };
}

describe("refreshJiraIssueCache persistence ordering", () => {
  const previous = {
    jiraKey: "EPM-1",
    projectKey: "EPM",
    summary: "Old summary",
    description: "",
    status: "To Do",
    statusId: null,
    statusCategory: "new",
    statusChangedAt: null,
    assigneeJira: null,
    reporterJira: null,
    approverJira: null,
    testerJira: null,
    epicKey: null,
    labels: [],
    fixVersionIds: [],
    fixVersionNames: [],
    priority: "",
    points: null,
    storyField: null,
    type: "Task",
    dueDate: null,
    timeSpent: null,
    originalEstimateSeconds: null,
    createdAt: null,
    updatedAt: new Date("2026-10-09T00:00:00.000Z"),
    lastSyncedAt: new Date("2026-10-09T00:00:00.000Z"),
    deletedAt: null,
    raw: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("notifies watchers only after the issue transaction commits", async () => {
    const events: string[] = [];
    const currentIssue = issue("2026-10-09T01:00:00.000Z");
    const refreshJiraIssueCache = createIssueCacheRefreshService({
      findIssueByKey: vi.fn().mockResolvedValue(previous),
      issueFieldsForProject: vi.fn().mockResolvedValue("summary,status,updated"),
      upsertIssue: vi.fn().mockImplementation(async () => {
        events.push("transaction:start");
        events.push("issue:write");
        const data = issueCacheData(currentIssue);
        await Promise.resolve();
        events.push("transaction:commit");
        return { applied: true, data };
      }),
      notifyIssueChange: vi.fn().mockImplementation(async () => {
        events.push("notify");
        return 1;
      }),
    });
    const client = {
      getIssue: vi.fn().mockResolvedValue(currentIssue),
    };

    await expect(refreshJiraIssueCache(client, "EPM-1")).resolves.toBe(true);
    expect(events).toEqual([
      "transaction:start",
      "issue:write",
      "transaction:commit",
      "notify",
    ]);
  });

  it("does not notify when the repository rejects a stale payload", async () => {
    const currentIssue = issue("2026-10-09T01:00:00.000Z");
    const notifyIssueChange = vi.fn().mockResolvedValue(0);
    const refreshJiraIssueCache = createIssueCacheRefreshService({
      findIssueByKey: vi.fn().mockResolvedValue(previous),
      issueFieldsForProject: vi.fn().mockResolvedValue("summary,status,updated"),
      upsertIssue: vi.fn().mockResolvedValue({
        applied: false,
        data: issueCacheData(currentIssue),
      }),
      notifyIssueChange,
    });
    const client = {
      getIssue: vi.fn().mockResolvedValue(currentIssue),
    };

    await expect(refreshJiraIssueCache(client, "EPM-1")).resolves.toBe(false);
    expect(notifyIssueChange).not.toHaveBeenCalled();
  });
});
