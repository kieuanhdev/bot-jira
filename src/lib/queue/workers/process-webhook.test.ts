import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProcessWebhook } from "./process-webhook";
import { prisma } from "@/lib/prisma";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import * as guardModule from "../guard";
import type { IntegrationEvent } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const eventRow = (payload: Prisma.JsonValue) =>
  ({
    id: "ev-1",
    source: "bitbucket",
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
  },
}));

vi.mock("@/lib/events/store", () => ({
  markEventProcessed: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    getPullRequest: vi.fn(),
  },
}));

vi.mock("@/lib/bitbucket/notify-pr-comment", () => ({
  notifyPrComment: vi.fn().mockResolvedValue({ notifiedCount: 1, targetUserIds: ["u-1"] }),
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
