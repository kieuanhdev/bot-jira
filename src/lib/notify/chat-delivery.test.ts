import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: { findUnique: vi.fn() },
    notificationOutbox: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildChatDigest,
  CHAT_DIGEST_WINDOW_MS,
  chatDedupeKey,
  chatDigestGroupPrefix,
  deliverToChat,
} from "./chat-delivery";

const outbox = prisma.notificationOutbox as unknown as {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};
const integrations = prisma.discordIntegration as unknown as { findUnique: ReturnType<typeof vi.fn> };

describe("chatDedupeKey", () => {
  it("is scoped to user, type, and event", () => {
    expect(chatDedupeKey("u1", "release", "e1")).toBe("u1:discord:release:e1");
    expect(chatDedupeKey("u1", "release", "e1")).not.toBe(chatDedupeKey("u2", "release", "e1"));
    expect(chatDedupeKey("u1", "release", "e1")).not.toBe(chatDedupeKey("u1", "release", "e2"));
  });
});

describe("deliverToChat", () => {
  it("skips when there is no event id", async () => {
    const r = await deliverToChat({ userId: "u1", type: "release", title: "x" });
    expect(r).toEqual({ delivered: false, skippedReason: "no_event_id" });
  });

  it("skips users without a private destination", async () => {
    integrations.findUnique.mockResolvedValue(null);
    const r = await deliverToChat({ userId: "u1", type: "release", title: "x", eventId: "e1" });
    expect(r).toEqual({ delivered: false, skippedReason: "no_destination" });
  });

  it("queues a Discord outbox row deduped per user and event", async () => {
    integrations.findUnique.mockResolvedValue({ id: "d1" });
    outbox.create.mockResolvedValue({ id: "o1" });
    const r = await deliverToChat({ userId: "u1", type: "release", title: "x", eventId: "e1" });
    expect(r.delivered).toBe(true);
    expect(outbox.create).toHaveBeenCalled();
    const data = outbox.create.mock.calls[0][0].data;
    expect(data.channel).toBe("discord");
    expect(data.userId).toBe("u1");
    expect(data.dedupeKey).toBe("u1:discord:release:e1");
  });

  it("reports already_queued on a unique violation", async () => {
    integrations.findUnique.mockResolvedValue({ id: "d1" });
    outbox.create.mockRejectedValue(new Error("P2002: unique constraint"));
    const r = await deliverToChat({ userId: "u1", type: "release", title: "x", eventId: "e1" });
    expect(r).toEqual({ delivered: false, skippedReason: "already_queued" });
  });
});

describe("chat digest", () => {
  const group = "bb-pr-comment:CICB/app:901";

  it("opens a new window for the first comment of a PR", async () => {
    integrations.findUnique.mockResolvedValue({ id: "d1" });
    outbox.findFirst.mockResolvedValue(null);
    outbox.create.mockResolvedValue({ id: "o1" });
    const before = Date.now();
    const r = await deliverToChat({
      userId: "u1", type: "comment", title: "x", eventId: `${group}:7`, digestGroup: group,
    });
    const data = outbox.create.mock.calls.at(-1)![0].data;
    expect(data.dedupeKey).toBe(`u1:discord:comment:digest:${group}|${group}:7`);
    expect(data.scheduledAt.getTime()).toBeGreaterThanOrEqual(before + CHAT_DIGEST_WINDOW_MS);
    expect(r.scheduledAt).toEqual(data.scheduledAt);
  });

  it("joins the open window of the same PR", async () => {
    const windowEnd = new Date(Date.now() + 60_000);
    integrations.findUnique.mockResolvedValue({ id: "d1" });
    outbox.findFirst.mockResolvedValue({ scheduledAt: windowEnd });
    outbox.create.mockResolvedValue({ id: "o2" });
    await deliverToChat({
      userId: "u1", type: "comment", title: "x", eventId: `${group}:8`, digestGroup: group,
    });
    expect(outbox.findFirst.mock.calls.at(-1)![0].where.dedupeKey).toEqual({
      startsWith: `u1:discord:comment:digest:${group}|`,
    });
    expect(outbox.create.mock.calls.at(-1)![0].data.scheduledAt).toEqual(windowEnd);
  });

  it("only treats digest keys as groupable", () => {
    expect(chatDigestGroupPrefix(`u1:discord:comment:digest:${group}|${group}:7`)).toBe(
      `u1:discord:comment:digest:${group}|`
    );
    expect(chatDigestGroupPrefix("u1:discord:release:e1")).toBeNull();
    expect(chatDigestGroupPrefix(null)).toBeNull();
  });

  it("merges rows and caps the listed comments", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      title: "PR #901", body: `lead: c${i}`, link: "/pr/901",
    }));
    const digest = buildChatDigest(rows);
    expect(digest.title).toBe("PR #901 (10 bình luận)");
    expect(digest.body.split("\n")).toHaveLength(9);
    expect(digest.body).toContain("… và 2 bình luận khác");
    expect(buildChatDigest(rows.slice(0, 1))).toEqual(rows[0]);
  });
});
