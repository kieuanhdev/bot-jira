import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { notificationOutbox: { create: vi.fn() } } }));
vi.mock("@/lib/chat", () => ({ getChatProvider: async () => ({ name: "discord" }) }));

import { prisma } from "@/lib/prisma";
import { chatDedupeKey, deliverToChat } from "./chat-delivery";

const outbox = prisma.notificationOutbox as unknown as { create: ReturnType<typeof vi.fn> };

describe("chatDedupeKey", () => {
  it("is scoped to type + event, not per user", () => {
    expect(chatDedupeKey("release", "e1")).toBe("chat:release:e1");
    expect(chatDedupeKey("release", "e1")).toBe(chatDedupeKey("release", "e1"));
    expect(chatDedupeKey("release", "e1")).not.toBe(chatDedupeKey("release", "e2"));
    expect(chatDedupeKey("release", "e1")).not.toBe(chatDedupeKey("comment", "e1"));
  });
});

describe("deliverToChat", () => {
  it("skips when there is no event id", async () => {
    const r = await deliverToChat({ type: "release", title: "x" });
    expect(r).toEqual({ delivered: false, skippedReason: "no_event_id" });
  });

  it("queues a chat outbox row deduped per logical event", async () => {
    outbox.create.mockResolvedValue({ id: "o1" });
    const r = await deliverToChat({ type: "release", title: "x", eventId: "e1" });
    expect(r.delivered).toBe(true);
    expect(outbox.create).toHaveBeenCalled();
    const data = outbox.create.mock.calls[0][0].data;
    expect(data.channel).toBe("chat");
    expect(data.dedupeKey).toBe("chat:release:e1");
  });

  it("reports already_queued on a unique violation", async () => {
    outbox.create.mockRejectedValue(new Error("P2002: unique constraint"));
    const r = await deliverToChat({ type: "release", title: "x", eventId: "e1" });
    expect(r).toEqual({ delivered: false, skippedReason: "already_queued" });
  });
});
