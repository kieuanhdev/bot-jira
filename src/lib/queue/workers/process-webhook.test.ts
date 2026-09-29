import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProcessWebhook } from "./process-webhook";
import { prisma } from "@/lib/prisma";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { jira } from "@/lib/jira/client";
import * as guardModule from "../guard";
import type { IntegrationEvent } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const eventRow = (payload: Prisma.JsonValue, source = "bitbucket") =>
  ({
    id: "ev-1",
    source,
    externalId: "ext-1",
    type: "bitbucket_webhook",
    subject: null,
    payload,
    receivedAt: new Date(),
    processedAt: null,
    processingError: null,
  }) satisfies IntegrationEvent;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    branchInfo: {
      upsert: vi.fn(),
    },
    issueCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    issueLinkCache: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    commentCache: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/events/store", () => ({
  markEventProcessed: vi.fn().mockResolvedValue({}),
  markEventFailed: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    getPullRequest: vi.fn(),
  },
}));

vi.mock("@/lib/bitbucket/notify-pr-comment", () => ({
  notifyPrComment: vi.fn().mockResolvedValue({ notifiedCount: 1, targetUserIds: ["u-1"] }),
}));

vi.mock("@/lib/jira/client", () => ({
  jiraIssueFields: vi.fn(() => "summary,status,updated"),
  jiraPointsFromFields: () => ({ points: null, fieldId: null }),
  parseJiraDate: vi.fn((value?: string) => value ? new Date(value) : null),
  jira: {
    getIssue: vi.fn().mockResolvedValue({
      id: "42",
      key: "EPM-42",
      self: "https://jira.example/browse/EPM-42",
      fields: {
        summary: "Changed",
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        updated: "2026-09-27T01:00:00.000Z",
      },
    }),
    getComments: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfComment: vi.fn().mockResolvedValue(0),
  notifyWatchersOfIssueChange: vi.fn().mockResolvedValue(1),
}));

describe("process-webhook for Bitbucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasBitbucketConfig").mockReturnValue(true);
  });

  it("handles pr:comment:added webhook event and notifies reviewers", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({
        eventKey: "pr:comment:added",
        pullRequest: {
          id: 99,
          title: "Optimize queries",
          author: { user: { name: "alice" } },
          reviewers: [{ user: { name: "bob" } }],
          toRef: { repository: { slug: "app-core", project: { key: "EPM" } } },
        },
        comment: {
          id: 888,
          text: "Can we use an index here?",
          author: { name: "bob", displayName: "Bob Reviewer" },
        },
      })
    );

    const result = await runProcessWebhook({ source: "bitbucket", eventId: "ev-1" });

    expect(result.ok).toBe(true);
    expect(notifyPrComment).toHaveBeenCalledWith({
      repo: "EPM/app-core",
      pr: expect.objectContaining({ id: 99, title: "Optimize queries" }),
      comment: expect.objectContaining({ id: 888, text: "Can we use an index here?" }),
    });
  });
});

describe("process-webhook for Jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasJiraConfig").mockReturnValue(true);
  });

  it("handles the standard Jira issue payload shape", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({
        webhookEvent: "jira:issue_updated",
        issue: { key: "EPM-42" },
        user: { name: "alice" },
        changelog: { items: [{ field: "status", fromString: "To Do", toString: "In Progress" }] },
      }, "jira")
    );

    const result = await runProcessWebhook({ source: "jira", eventId: "ev-1" });

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual(expect.objectContaining({ refreshed: "EPM-42" }));
  });

  it("notifies new comments discovered by an issue update without a comment payload", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({ webhookEvent: "jira:issue_updated", issue: { key: "EPM-42" } }, "jira")
    );
    vi.mocked(jira.getComments).mockResolvedValueOnce([
      { id: "comment-42", body: "Ready for review", author: { name: "alice" } },
    ]);
    vi.mocked(prisma.commentCache.findUnique).mockResolvedValueOnce(null);
    const result = await runProcessWebhook({ source: "jira", eventId: "ev-1" });
    expect(result.ok).toBe(true);
    expect(notifyWatchersOfComment).toHaveBeenCalledWith("EPM-42", "alice", "Ready for review", "comment-42");
  });
});
