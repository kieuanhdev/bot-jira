import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  enqueue: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session, isAdmin: () => true }));
vi.mock("@/lib/prisma", () => ({
  prisma: { notificationOutbox: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/queue/enqueue", () => ({ enqueueNotificationDelivery: mocks.enqueue }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { POST } from "./route";

function post(body?: string) {
  return new Request("http://localhost/api/admin/outbox/retry", { method: "POST", body });
}

describe("POST /api/admin/outbox/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", email: "a@x.com" } });
    mocks.findMany.mockResolvedValue([{ id: "o1" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("accepts an empty body and retries every failed row", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    expect(mocks.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });

  it("limits the retry to the given ids", async () => {
    const res = await POST(post(JSON.stringify({ ids: ["o1"] })));
    expect(res.status).toBe(200);
    expect(mocks.findMany.mock.calls[0][0].where.id).toEqual({ in: ["o1"] });
  });

  it("rejects a malformed body", async () => {
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
