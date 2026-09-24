import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      user: { findUnique: vi.fn() },
      notificationPreference: { findUnique: vi.fn() },
      notification: { findUnique: vi.fn(), create: vi.fn() },
      notificationOutbox: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notify/push", () => ({ sendPush: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { notifyBackoffBaseMs: 60_000 } }));

import { dedupeKeyFor, backoffMs, deliverNotification } from "./outbox";

describe("dedupeKeyFor", () => {
  it("produces a stable, scoped key", () => {
    const a = dedupeKeyFor({ userId: "u1", type: "comment", eventId: "c123" });
    const b = dedupeKeyFor({ userId: "u1", type: "comment", eventId: "c123" });
    expect(a).toBe(b);
    expect(a).toBe("u1:comment:c123");
  });

  it("differs per user and per event", () => {
    expect(dedupeKeyFor({ userId: "u1", type: "comment", eventId: "c1" })).not.toBe(
      dedupeKeyFor({ userId: "u2", type: "comment", eventId: "c1" })
    );
    expect(dedupeKeyFor({ userId: "u1", type: "comment", eventId: "c1" })).not.toBe(
      dedupeKeyFor({ userId: "u1", type: "comment", eventId: "c2" })
    );
  });
});

describe("backoffMs", () => {
  it("grows exponentially and caps", () => {
    const base = 60_000;
    expect(backoffMs(0)).toBe(base);
    expect(backoffMs(1)).toBe(base * 2);
    expect(backoffMs(2)).toBe(base * 4);
    // Capped at 2^10 to avoid absurd delays.
    expect(backoffMs(30)).toBe(base * 2 ** 10);
  });
});

describe("deliverNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_user when user is not found", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await deliverNotification("u_missing", {
      type: "comment",
      title: "Title",
      eventId: "e1",
    });

    expect(res.delivered).toBe(false);
    expect(res.skippedReason).toBe("no_user");
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("skips notification when type is disabled in user preferences", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", pushSubscription: null });
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      userId: "u1",
      disabledTypes: ["comment"],
      pushEnabled: false,
      pushDisabledTypes: [],
    });

    const res = await deliverNotification("u1", {
      type: "comment",
      title: "Comment alert",
      eventId: "c1",
    });

    expect(res.delivered).toBe(false);
    expect(res.skippedReason).toBe("disabled");
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("creates in-app notification when not disabled and does not push when pushEnabled is false", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", pushSubscription: { endpoint: "https://push..." } });
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      userId: "u1",
      disabledTypes: [],
      pushEnabled: false,
      pushDisabledTypes: [],
    });
    prismaMock.notification.findUnique.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({
      id: "n1",
      userId: "u1",
      type: "stale",
      eventKey: "stale:MR-10:warning:2",
      title: "Task MR-10 exceeds SLA",
      body: "details",
      link: "/issue/MR-10",
      read: false,
    });

    const res = await deliverNotification("u1", {
      type: "stale",
      title: "Task MR-10 exceeds SLA",
      body: "details",
      link: "/issue/MR-10",
      eventKey: "stale:MR-10:warning:2",
    });

    expect(res.delivered).toBe(true);
    expect(res.notificationId).toBe("n1");
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("enqueues push delivery only when pushEnabled is true and user has subscription", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", pushSubscription: { endpoint: "https://push..." } });
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      userId: "u1",
      disabledTypes: [],
      pushEnabled: true,
      pushDisabledTypes: [],
    });
    prismaMock.notification.findUnique.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({
      id: "n2",
      userId: "u1",
      type: "release",
      eventKey: "release:r1:published",
      title: "Release v1.0",
    });
    prismaMock.notificationOutbox.create.mockResolvedValue({
      id: "out1",
    });

    const res = await deliverNotification("u1", {
      type: "release",
      title: "Release v1.0",
      eventKey: "release:r1:published",
    });

    expect(res.delivered).toBe(true);
    expect(res.notificationId).toBe("n2");
    expect(res.outboxId).toBe("out1");
    expect(prismaMock.notificationOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "push",
          dedupeKey: "u1:release:release:r1:published",
        }),
      })
    );
  });

  it("returns existing notification on dedupe replay without creating duplicates", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", pushSubscription: null });
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    prismaMock.notification.findUnique.mockResolvedValue({
      id: "existing_n",
      userId: "u1",
      type: "comment",
      eventKey: "jira-comment:1001",
      title: "Comment",
    });

    const res = await deliverNotification("u1", {
      type: "comment",
      title: "Comment",
      eventKey: "jira-comment:1001",
    });

    expect(res.delivered).toBe(true);
    expect(res.notificationId).toBe("existing_n");
    expect(res.skippedReason).toBe("already_queued");
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled();
  });
});
