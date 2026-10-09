import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  enqueue: vi.fn(),
  sendPush: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationOutbox: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock("@/lib/notify/chat-delivery", () => ({ sendChatOutbox: mocks.send }));
vi.mock("@/lib/notify/outbox", () => ({ backoffMs: () => 1000 }));
vi.mock("@/lib/queue/enqueue", () => ({ enqueueNotificationDelivery: mocks.enqueue }));
vi.mock("@/lib/notify/push", () => ({ sendPush: mocks.sendPush }));

import { runDeliverNotifications } from "./deliver-notifications";

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.send.mockResolvedValue(true);
    mocks.enqueue.mockResolvedValue("job");
    mocks.sendPush.mockResolvedValue(undefined);
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      pushSubscription: { endpoint: "https://push.example.com" },
    });
    mocks.userUpdate.mockResolvedValue({});
  });

  const row = {
    id: "out-1",
    userId: "user-1",
    channel: "discord",
    title: "Changed",
    body: "",
    link: null,
    attemptCount: 0,
  };

  it("continues draining a full batch without waiting for the minute schedule", async () => {
    mocks.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ ...row, id: `out-${i}` }))
    );
    await runDeliverNotifications();
    expect(mocks.send).toHaveBeenCalledTimes(100);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("does not deliver a row another worker already leased", async () => {
    mocks.findMany.mockResolvedValue([row]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await runDeliverNotifications();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("reschedules failed delivery and still sends the next notification", async () => {
    mocks.findMany.mockResolvedValue([row, { ...row, id: "out-2" }]);
    mocks.send.mockRejectedValueOnce(new Error("Discord unavailable"));
    await runDeliverNotifications();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out-1" },
        data: expect.objectContaining({
          state: "pending",
          attemptCount: 1,
          scheduledAt: expect.any(Date),
        }),
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out-2" },
        data: expect.objectContaining({ state: "sent" }),
      })
    );
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.any(Date));
  });

  it("delivers mixed push and discord batch independently with partial failure isolation", async () => {
    const pushRow = {
      id: "out-push-1",
      userId: "user-1",
      channel: "push",
      title: "Push title",
      body: "Push body",
      link: "/issues/1",
      attemptCount: 0,
    };
    const discordRow = {
      id: "out-discord-1",
      userId: "user-1",
      channel: "discord",
      title: "Discord title",
      body: "Discord body",
      link: null,
      attemptCount: 0,
    };

    mocks.findMany.mockResolvedValue([pushRow, discordRow]);
    // Discord fails with an error, push succeeds
    mocks.send.mockRejectedValueOnce(new Error("Discord API timeout"));

    const result = await runDeliverNotifications();
    expect(result.ok).toBe(true);
    expect(result.stats?.sent).toBe(1);
    expect(result.stats?.due).toBe(2);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);

    // Push row was marked sent
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out-push-1" },
        data: expect.objectContaining({ state: "sent" }),
      })
    );
    // Discord row was marked pending with retry
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out-discord-1" },
        data: expect.objectContaining({
          state: "pending",
          attemptCount: 1,
        }),
      })
    );
  });

  it("cleans up user push subscription and marks skipped when push returns 410 Gone", async () => {
    const pushRow = {
      id: "out-push-expired",
      userId: "user-1",
      channel: "push",
      title: "Push title",
      body: "Push body",
      link: null,
      attemptCount: 0,
    };

    mocks.findMany.mockResolvedValue([pushRow]);
    mocks.sendPush.mockRejectedValueOnce(new Error("WebPush 410: Push subscription has expired"));

    const result = await runDeliverNotifications();
    expect(result.ok).toBe(true);
    expect(result.stats?.skipped).toBe(1);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { pushSubscription: null },
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out-push-expired" },
        data: expect.objectContaining({
          state: "skipped",
          lastError: "subscription gone",
        }),
      })
    );
  });
});
