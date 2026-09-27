import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: { findUnique: vi.fn() },
    notificationOutbox: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { chatDedupeKey, deliverToChat } from "./chat-delivery";

const outbox = prisma.notificationOutbox as unknown as { create: ReturnType<typeof vi.fn> };
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
