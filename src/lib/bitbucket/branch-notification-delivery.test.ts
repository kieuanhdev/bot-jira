import { describe, it, expect, vi } from "vitest";
import { deliverBranchNotifications } from "./branch-notification-delivery";
import type { BranchNotificationMessage } from "./branch-notification-policy";

describe("branch-notification-delivery", () => {
  const sampleMessage: BranchNotificationMessage = {
    type: "comment",
    title: "Bình luận mới",
    body: "Nội dung",
    link: "/branches",
    severity: "info",
    eventKey: "bb-test-1",
  };

  it("delivers to all users and counts successes", async () => {
    const deliverFn = vi.fn().mockResolvedValue({ id: "notif-1" });

    const count = await deliverBranchNotifications(
      ["u-1", "u-2", "u-3"],
      sampleMessage,
      deliverFn
    );

    expect(count).toBe(3);
    expect(deliverFn).toHaveBeenCalledTimes(3);
    expect(deliverFn).toHaveBeenCalledWith("u-1", sampleMessage);
    expect(deliverFn).toHaveBeenCalledWith("u-2", sampleMessage);
    expect(deliverFn).toHaveBeenCalledWith("u-3", sampleMessage);
  });

  it("swallows individual errors and delivers to other recipients", async () => {
    const deliverFn = vi.fn()
      .mockResolvedValueOnce({ id: "notif-1" })
      .mockRejectedValueOnce(new Error("Push delivery timeout"))
      .mockResolvedValueOnce({ id: "notif-3" });

    const count = await deliverBranchNotifications(
      ["u-1", "u-2", "u-3"],
      sampleMessage,
      deliverFn
    );

    expect(count).toBe(2);
    expect(deliverFn).toHaveBeenCalledTimes(3);
  });

  it("returns 0 when userIds is empty", async () => {
    const deliverFn = vi.fn();
    const count = await deliverBranchNotifications([], sampleMessage, deliverFn);
    expect(count).toBe(0);
    expect(deliverFn).not.toHaveBeenCalled();
  });
});
