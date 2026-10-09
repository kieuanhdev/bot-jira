import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProcessWebhook } from "./process-webhook";
import { prisma } from "@/lib/prisma";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { jira } from "@/lib/jira/client";
import { markEventFailed, markEventProcessed } from "@/lib/events/store";
import { notifyAll } from "@/lib/notify";
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
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const self = (await import("@/lib/prisma")).prisma;
      return cb(self);
    }),
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
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    issueLinkCache: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    commentCache: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    issueTransitionEvent: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    sentryIssueImported: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    ciBuildStatus: {
      upsert: vi.fn().mockResolvedValue({}),
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

vi.mock("@/lib/bitbucket/notify-commit-comment", () => ({
  notifyCommitComment: vi.fn().mockResolvedValue({ notifiedCount: 1, targetUserIds: ["u-2"] }),
}));

vi.mock("@/lib/jira/client", () => ({
  hasJiraCredentials: vi.fn(async () => true),
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

vi.mock("@/lib/notify", () => ({
  notifyAll: vi.fn().mockResolvedValue([]),
}));

describe("process-webhook dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found without changing event status", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(null);

    const result = await runProcessWebhook({ source: "jira", eventId: "missing" });

    expect(result).toEqual({ ok: false, errors: ["event missing not found"] });
    expect(markEventProcessed).not.toHaveBeenCalled();
    expect(markEventFailed).not.toHaveBeenCalled();
  });

  it("skips an event that was already processed", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue({
      ...eventRow({}, "ci"),
      processedAt: new Date("2026-10-09T00:00:00.000Z"),
    });

    const result = await runProcessWebhook({ source: "ci", eventId: "ev-1" });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "already processed",
      stats: { eventId: "ev-1" },
    });
    expect(prisma.ciBuildStatus.upsert).not.toHaveBeenCalled();
    expect(markEventProcessed).not.toHaveBeenCalled();
  });

  it("keeps a failed event retryable and caps the stored error", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({ runId: "run-1", commit: "abc", status: "failed" }, "ci")
    );
    vi.mocked(prisma.ciBuildStatus.upsert).mockRejectedValueOnce(
      new Error("x".repeat(400))
    );

    const result = await runProcessWebhook({ source: "ci", eventId: "ev-1" });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toHaveLength(300);
    expect(markEventFailed).toHaveBeenCalledWith("ev-1", "x".repeat(300));
    expect(markEventProcessed).not.toHaveBeenCalled();
  });
});

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

  it("handles repo:comment:added webhook event for commit comments and notifies commit author", async () => {
    const { notifyCommitComment } = await import("@/lib/bitbucket/notify-commit-comment");
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({
        eventKey: "repo:comment:added",
        repository: { slug: "sds_feedback", project: { key: "SMA" } },
        commit: "501630298ae1179c02241a5024966b789e5b4b73",
        comment: {
          id: 358407,
          text: "navigate",
          author: { name: "ngocdv", displayName: "ngocdv" },
        },
      })
    );

    const result = await runProcessWebhook({ source: "bitbucket", eventId: "ev-commit-1" });

    expect(result.ok).toBe(true);
    expect(notifyCommitComment).toHaveBeenCalledWith({
      repo: "SMA/sds_feedback",
      commit: { id: "501630298ae1179c02241a5024966b789e5b4b73" },
      comment: expect.objectContaining({ id: 358407, text: "navigate" }),
    });
  });
});

describe("process-webhook for Jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

describe("process-webhook for Sentry and CI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasSentryConfig").mockReturnValue(true);
  });

  it("seeds a newly created Sentry issue idempotently", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({
        action: "created",
        issue: {
          id: 42,
          shortId: "APP-42",
          title: "Unhandled error",
          level: "not-a-blocking-level",
          project: { slug: "app" },
        },
      }, "sentry")
    );

    const result = await runProcessWebhook({ source: "sentry", eventId: "ev-1" });

    expect(result.ok).toBe(true);
    expect(prisma.sentryIssueImported.upsert).toHaveBeenCalledWith({
      where: {
        sentryProject_sentryIssueId: {
          sentryProject: "app",
          sentryIssueId: "42",
        },
      },
      create: { sentryProject: "app", sentryIssueId: "42", state: "pending" },
      update: {},
    });
    expect(markEventProcessed).toHaveBeenCalledWith("ev-1");
  });

  it("upserts a terminal CI status and sends one deduplicated notification", async () => {
    vi.mocked(prisma.integrationEvent.findUnique).mockResolvedValue(
      eventRow({
        runId: "run-7",
        status: "passed",
        repo: "team/app",
        branch: "main",
        commit: "abcdef1234567890",
        provider: "buildkite",
        url: "https://ci.example/runs/7",
      }, "ci")
    );

    const result = await runProcessWebhook({ source: "ci", eventId: "ev-1" });

    expect(result.ok).toBe(true);
    expect(prisma.ciBuildStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_externalId: {
            provider: "buildkite",
            externalId: "passed:team/app:abcdef1234567890:run-7",
          },
        },
        create: expect.objectContaining({ status: "success" }),
      })
    );
    expect(notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ci",
        severity: "success",
        eventKey: "ci:passed:team/app:abcdef1234567890:run-7",
      })
    );
    expect(markEventProcessed).toHaveBeenCalledWith("ev-1");
  });
});
