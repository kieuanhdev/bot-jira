import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: mocks.updateUser } },
}));

import { POST } from "./route";

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.updateUser.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ unsubscribe: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_json on malformed body", async () => {
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 400 payload_too_large when body > 4KB", async () => {
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "5000",
      },
      body: JSON.stringify({ unsubscribe: true, extra: "x".repeat(5000) }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "payload_too_large" });
  });

  it("returns 400 when subscription has invalid endpoint or missing keys", async () => {
    // Non-https endpoint
    const req1 = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: {
          endpoint: "http://insecure.test",
          keys: { p256dh: "key", auth: "auth" },
        },
      }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);
    await expect(res1.json()).resolves.toEqual({ error: "subscription required" });

    // Missing keys
    const req2 = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://secure.test",
        },
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
    await expect(res2.json()).resolves.toEqual({ error: "subscription required" });
  });

  it("successfully subscribes with valid https endpoint and keys", async () => {
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        pushSubscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
        },
      },
    });
  });

  it("successfully unsubscribes", async () => {
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unsubscribe: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { pushSubscription: Prisma.DbNull },
    });
  });
});
