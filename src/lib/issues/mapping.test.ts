import { describe, expect, it } from "vitest";
import type { JiraComment, JiraIssue, JiraIssueLink } from "@/lib/jira/types";
import {
  mapJiraCommentToCacheData,
  mapJiraIssueLinks,
  mapJiraIssueToCacheData,
  type IssueMappingContext,
} from "./mapping";

const SYNCED_AT = new Date("2026-10-09T01:02:03.000Z");

function issue(fields: JiraIssue["fields"], key = "EPM-123"): JiraIssue {
  return { id: "10001", key, self: "https://jira/issue/10001", fields };
}

function context(overrides: Partial<IssueMappingContext> = {}): IssueMappingContext {
  return {
    peopleFields: {
      reporter: "reporter",
      approver: "customfield_20001",
      tester: "customfield_20002",
    },
    points: { points: 5, fieldId: "customfield_10002" },
    epicLinkFieldIds: ["customfield_10008"],
    syncedAt: SYNCED_AT,
    ...overrides,
  };
}

describe("mapJiraIssueToCacheData", () => {
  it("maps missing and null custom fields to stable read-model defaults", () => {
    const mapped = mapJiraIssueToCacheData(
      issue({
        reporter: null,
        customfield_20001: null,
      }),
      context()
    );

    expect(mapped).toMatchObject({
      projectKey: "EPM",
      description: "",
      reporterJira: null,
      approverJira: null,
      testerJira: null,
      statusCategory: "unknown",
      dueDate: null,
      createdAt: null,
      updatedAt: null,
      lastSyncedAt: SYNCED_AT,
    });
  });

  it("uses project people fields and ignores malformed people values", () => {
    const mapped = mapJiraIssueToCacheData(
      issue({
        reporter: { name: "reporter_mb" },
        customfield_20001: { name: "approver_mb" },
        customfield_20002: ["not-a-user"],
      }),
      context()
    );

    expect(mapped.reporterJira).toBe("reporter_mb");
    expect(mapped.approverJira).toBe("approver_mb");
    expect(mapped.testerJira).toBeNull();
  });

  it("parses valid Jira dates and fails invalid dates closed to null", () => {
    const mapped = mapJiraIssueToCacheData(
      issue({
        customfield_10706: "invalid",
        resolutiondate: "2026-10-01T02:03:04.000+0700",
        duedate: "not-a-date",
        created: "2026-09-30T19:03:04.000Z",
        updated: "",
      }),
      context()
    );

    expect(mapped.statusChangedAt?.toISOString()).toBe("2026-09-30T19:03:04.000Z");
    expect(mapped.createdAt?.toISOString()).toBe("2026-09-30T19:03:04.000Z");
    expect(mapped.dueDate).toBeNull();
    expect(mapped.updatedAt).toBeNull();
  });

  it("maps only configured custom epic fields or real Epic parents", () => {
    const customEpic = mapJiraIssueToCacheData(
      issue({ customfield_10008: "epm-9", customfield_99999: "EPM-10" }),
      context()
    );
    const storyParent = mapJiraIssueToCacheData(
      issue({ parent: { key: "EPM-11", fields: { issuetype: { name: "Story" } } } }),
      context()
    );
    const epicParent = mapJiraIssueToCacheData(
      issue({ parent: { key: "EPM-12", fields: { issuetype: { name: "Epic" } } } }),
      context()
    );

    expect(customEpic.epicKey).toBe("EPM-9");
    expect(storyParent.epicKey).toBeNull();
    expect(epicParent.epicKey).toBe("EPM-12");
  });
});

describe("mapJiraCommentToCacheData", () => {
  it("maps body, author precedence and dates", () => {
    const comment: JiraComment = {
      id: "501",
      body: "Reviewed",
      author: { name: "login", displayName: "Display Name" },
      created: "2026-10-01T02:03:04.000+0700",
      updated: "invalid",
    };

    expect(mapJiraCommentToCacheData("EPM-1", comment)).toEqual({
      jiraCommentId: "501",
      jiraKey: "EPM-1",
      author: "Display Name",
      body: "Reviewed",
      createdAt: new Date("2026-09-30T19:03:04.000Z"),
      updatedAt: null,
    });
  });

  it("ignores comments without an id or non-empty body", () => {
    expect(mapJiraCommentToCacheData("EPM-1", { id: "", body: "text" })).toBeNull();
    expect(mapJiraCommentToCacheData("EPM-1", { id: "1", body: "  " })).toBeNull();
  });
});

describe("mapJiraIssueLinks", () => {
  it("normalizes dependency links and drops unrelated or malformed links", () => {
    const links: JiraIssueLink[] = [
      {
        id: "10",
        type: { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
        inwardIssue: { key: "epm-2" },
      },
      {
        id: "11",
        type: { id: "2", name: "Relates", inward: "relates to", outward: "relates to" },
        outwardIssue: { key: "EPM-3" },
      },
    ];

    expect(
      mapJiraIssueLinks(" epm-1 ", links, {
        linkTypeName: "Blocks",
        inwardLabel: "is blocked by",
      })
    ).toEqual([
      expect.objectContaining({ jiraLinkId: "10", outwardKey: "EPM-2", inwardKey: "EPM-1" }),
    ]);
    expect(
      mapJiraIssueLinks("EPM-1", undefined, {
        linkTypeName: "Blocks",
        inwardLabel: "is blocked by",
      })
    ).toEqual([]);
  });
});
