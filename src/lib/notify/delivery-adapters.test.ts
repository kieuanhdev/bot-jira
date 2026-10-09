import { describe, expect, it, vi } from "vitest";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  PushDeliveryAdapter,
  DiscordDeliveryAdapter,
  UnsupportedChannelAdapter,
  getDeliveryAdapter,
} from "./delivery-adapters";
import type { OutboxItem } from "./delivery-contract";

describe("PushDeliveryAdapter", () => {
  const item: OutboxItem = {
    id: "item-1",
    userId: "user-1",
    channel: "push",
    title: "Alert",
    body: "Body",
    link: "/task/1",
    attemptCount: 0,
  };

  it("skips delivery when user is not found", async () => {
    const mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as typeof defaultPrisma;
    const adapter = new PushDeliveryAdapter({ prisma: mockPrisma });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({ status: "skipped", reason: "user not found" });
  });

  it("skips delivery when user has no push subscription", async () => {
    const mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", pushSubscription: null }) },
    } as unknown as typeof defaultPrisma;
    const adapter = new PushDeliveryAdapter({ prisma: mockPrisma });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({ status: "skipped", reason: "no push subscription" });
  });

  it("delivers push successfully when user has subscription", async () => {
    const mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", pushSubscription: { endpoint: "https://..." } }) },
    } as unknown as typeof defaultPrisma;
    const sendPushMock = vi.fn().mockResolvedValue(undefined);
    const adapter = new PushDeliveryAdapter({ prisma: mockPrisma, sendPush: sendPushMock });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({ status: "sent" });
    expect(sendPushMock).toHaveBeenCalledWith("user-1", {
      title: "Alert",
      body: "Body",
      url: "/task/1",
    });
  });

  it("marks skipped with cleanup when push returns 410 Gone", async () => {
    const mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", pushSubscription: { endpoint: "https://..." } }) },
    } as unknown as typeof defaultPrisma;
    const sendPushMock = vi.fn().mockRejectedValue(new Error("WebPush 410: Gone"));
    const adapter = new PushDeliveryAdapter({ prisma: mockPrisma, sendPush: sendPushMock });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({
      status: "skipped",
      reason: "subscription gone",
      cleanupSubscription: true,
    });
  });

  it("returns retry on server or network error", async () => {
    const mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", pushSubscription: { endpoint: "https://..." } }) },
    } as unknown as typeof defaultPrisma;
    const sendPushMock = vi.fn().mockRejectedValue(new Error("500 Internal Server Error"));
    const adapter = new PushDeliveryAdapter({ prisma: mockPrisma, sendPush: sendPushMock });

    const outcome = await adapter.deliver(item);
    expect(outcome.status).toBe("retry");
    if (outcome.status === "retry") {
      expect(outcome.error).toContain("500 Internal Server Error");
    }
  });
});

describe("DiscordDeliveryAdapter", () => {
  const item: OutboxItem = {
    id: "item-2",
    userId: "user-2",
    channel: "discord",
    title: "Chat Alert",
    body: "Chat Body",
    link: null,
    attemptCount: 0,
  };

  it("marks skipped when sendChatOutbox returns false (no destination)", async () => {
    const sendChatMock = vi.fn().mockResolvedValue(false);
    const adapter = new DiscordDeliveryAdapter({ sendChatOutbox: sendChatMock });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({ status: "skipped", reason: "no Discord destination" });
  });

  it("marks sent when sendChatOutbox returns true", async () => {
    const sendChatMock = vi.fn().mockResolvedValue(true);
    const adapter = new DiscordDeliveryAdapter({ sendChatOutbox: sendChatMock });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({ status: "sent" });
  });

  it("returns retry with retryAfterMs when rate limited", async () => {
    const error = Object.assign(new Error("Discord 429: Too many requests"), { retryAfterMs: 5000 });
    const sendChatMock = vi.fn().mockRejectedValue(error);
    const adapter = new DiscordDeliveryAdapter({ sendChatOutbox: sendChatMock });

    const outcome = await adapter.deliver(item);
    expect(outcome).toEqual({
      status: "retry",
      error: "Discord 429: Too many requests",
      retryAfterMs: 5000,
    });
  });
});

describe("getDeliveryAdapter", () => {
  it("resolves PushDeliveryAdapter for push", () => {
    const adapter = getDeliveryAdapter("push");
    expect(adapter.channel).toBe("push");
  });

  it("resolves DiscordDeliveryAdapter for discord and legacy chat", () => {
    expect(getDeliveryAdapter("discord").channel).toBe("discord");
    expect(getDeliveryAdapter("chat").channel).toBe("discord");
  });

  it("returns UnsupportedChannelAdapter for unknown channels", async () => {
    const adapter = getDeliveryAdapter("telegram");
    expect(adapter).toBeInstanceOf(UnsupportedChannelAdapter);
    const outcome = await adapter.deliver({
      id: "1",
      userId: "u",
      channel: "telegram",
      title: "t",
      body: "b",
      link: null,
      attemptCount: 0,
    });
    expect(outcome).toEqual({ status: "skipped", reason: "unsupported channel: telegram" });
  });
});
