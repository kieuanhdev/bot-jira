import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, deliverNotificationMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn() },
  },
  deliverNotificationMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("./outbox", () => ({
  deliverNotification: deliverNotificationMock,
}));

import { notifyAll, notifyEveryone } from "./index";

describe("notifyAll broadcast policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliverNotificationMock.mockResolvedValue({ notificationId: null });
  });

  it("targets operational roles and regular members who explicitly opted in", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "member-opted-in" }]);

    await notifyAll({
      type: "release",
      title: "Release ready",
      eventKey: "release:1:ready",
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { role: { in: ["lead", "release_manager", "admin"] } },
          { preferences: { is: { broadcastEnabled: true } } },
          { jiraUsername: { in: ["anhnk_mb"], mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    expect(deliverNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("targets every account for explicit everyone events", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "member-1" }, { id: "member-2" }]);

    await notifyEveryone({
      type: "release",
      title: "Release published",
      eventKey: "release:1:published",
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(deliverNotificationMock).toHaveBeenCalledTimes(2);
  });
});
