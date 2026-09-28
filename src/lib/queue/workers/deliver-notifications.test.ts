import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(),
  send: vi.fn(), enqueue: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { notificationOutbox: {
  findMany: mocks.findMany, updateMany: mocks.updateMany, update: mocks.update,
} } }));
vi.mock("@/lib/notify/chat-delivery", () => ({ sendChatOutbox: mocks.send }));
vi.mock("@/lib/notify/outbox", () => ({ backoffMs: () => 1000 }));
vi.mock("@/lib/queue/boss", () => ({ enqueueNotificationDelivery: mocks.enqueue }));
vi.mock("@/lib/notify/push", () => ({ sendPush: vi.fn() }));
import { runDeliverNotifications } from "./deliver-notifications";

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.send.mockResolvedValue(true);
    mocks.enqueue.mockResolvedValue("job");
  });
  const row = { id: "out-1", userId: "user-1", channel: "discord", title: "Changed", body: "", link: null, attemptCount: 0 };

  it("continues draining a full batch without waiting for the minute schedule", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ ...row, id: `out-${i}` })));
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
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "out-1" }, data: expect.objectContaining({ state: "pending", attemptCount: 1, scheduledAt: expect.any(Date) }),
    }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "out-2" }, data: expect.objectContaining({ state: "sent" }),
    }));
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.any(Date));
  });
});
