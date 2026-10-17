import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    bulkOperation: { findFirst: mocks.findFirst },
    sentryIssueImported: { updateMany: mocks.updateMany },
  };
  return {
    prisma: {
      bulkOperation: { findFirst: mocks.findFirst, findUnique: mocks.findUnique },
      sentryIssueImported: { updateMany: mocks.updateMany },
      $transaction: mocks.transaction.mockImplementation(
        (fn: (t: typeof tx) => unknown) => fn(tx)
      ),
    },
  };
});

import {
  buildSentryBulkRequest,
  confirmSentryCreate,
  hasInflightSentryOp,
  INFLIGHT_OP_MAX_AGE_MS,
  MSG_INFLIGHT,
  MSG_NO_PROJECT,
  MSG_NOT_OPEN,
} from "./create-from-form";
import { sentryLabel } from "./idempotency";

const SENTRY = { id: "r1", sentryIssueId: "123", targetProject: "EPM" };

describe("buildSentryBulkRequest", () => {
  it("appends sentry labels after the row's own labels", () => {
    const req = buildSentryBulkRequest({ clientRef: "x", summary: "s", labels: ["x"] }, SENTRY);
    expect("error" in req).toBe(false);
    if ("error" in req) return;
    expect(req.items[0].labels).toEqual(["x", "sentry", sentryLabel({ id: "123" })]);
    expect(req.items[0].labels).toEqual(["x", "sentry", "sentry-id-123"]);
  });

  it("does not duplicate labels already present", () => {
    const req = buildSentryBulkRequest(
      { clientRef: "x", summary: "s", labels: ["sentry", "sentry-id-123", "a"] },
      SENTRY
    );
    if ("error" in req) throw new Error("unexpected error");
    expect(req.items[0].labels).toEqual(["sentry", "sentry-id-123", "a"]);
  });

  it("returns an error when targetProject is null", () => {
    expect(
      buildSentryBulkRequest({ clientRef: "x", summary: "s" }, { ...SENTRY, targetProject: null })
    ).toEqual({ error: MSG_NO_PROJECT });
  });

  it("forces projectKey, clientRef and source", () => {
    const req = buildSentryBulkRequest(
      { clientRef: "whatever", summary: "s", issueTypeId: "10" },
      SENTRY
    );
    if ("error" in req) throw new Error("unexpected error");
    expect(req.projectKey).toBe("EPM");
    expect(req.items).toHaveLength(1);
    expect(req.items[0]).toMatchObject({ clientRef: "single-1", summary: "s", issueTypeId: "10" });
    expect(req.source).toEqual({ type: "sentry", sentryImportId: "r1" });
  });
});

describe("hasInflightSentryOp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is true when a queued op targets the row", async () => {
    mocks.findFirst.mockResolvedValue({ id: "op-1" });
    await expect(hasInflightSentryOp("r1")).resolves.toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        type: "create-issues",
        state: { in: ["queued", "running"] },
        createdAt: { gte: expect.any(Date) },
        payload: { path: ["source", "sentryImportId"], equals: "r1" },
      },
      select: { id: true },
    });
  });

  it("is false when only completed ops exist (not matched by the state filter)", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(hasInflightSentryOp("r1")).resolves.toBe(false);
    const where = mocks.findFirst.mock.calls[0][0].where;
    expect(where.state.in).not.toContain("completed");
    expect(where.state.in).not.toContain("preview");
  });

  it("ignores ops older than the max age so a stuck op cannot block the row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T10:00:00Z"));
    try {
      mocks.findFirst.mockResolvedValue(null);
      await hasInflightSentryOp("r1");
      const where = mocks.findFirst.mock.calls[0][0].where;
      expect(where.createdAt.gte.getTime()).toBe(Date.parse("2026-10-17T10:00:00Z") - INFLIGHT_OP_MAX_AGE_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes the operation being confirmed", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await hasInflightSentryOp("r1", "op-2");
    expect(mocks.findFirst.mock.calls[0][0].where.id).toEqual({ not: "op-2" });
  });
});

describe("confirmSentryCreate", () => {
  const confirmed = { operationId: "op-1", total: 1, actionable: 1, blocked: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      payload: { projectKey: "EPM", source: { type: "sentry", sentryImportId: "r1" } },
    });
    mocks.queryRaw.mockResolvedValue([{ state: "review" }]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  function run(confirm = vi.fn().mockResolvedValue(confirmed)) {
    return {
      confirm,
      result: confirmSentryCreate({
        sentryImportId: "r1",
        operationId: "op-1",
        reviewer: "admin@x",
        confirm,
      }),
    };
  }

  it("confirms under a row lock and records the reviewer without changing state", async () => {
    const { confirm, result } = run();
    await expect(result).resolves.toEqual({ ok: true, result: confirmed });
    expect(confirm).toHaveBeenCalledWith("op-1");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect((mocks.queryRaw.mock.calls[0][0] as string[]).join("")).toMatch(
      /FROM "SentryIssueImported"[\s\S]*FOR UPDATE/
    );
    expect(mocks.findFirst.mock.calls[0][0].where.id).toEqual({ not: "op-1" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", state: { in: ["review", "pending", "rejected"] } },
      data: { reviewedBy: "admin@x", reviewedAt: expect.any(Date) },
    });
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("state");
  });

  it("rejects an op created for another sentry row", async () => {
    mocks.findUnique.mockResolvedValue({
      payload: { source: { type: "sentry", sentryImportId: "other" } },
    });
    const { confirm, result } = run();
    await expect(result).resolves.toMatchObject({ ok: false, status: 400 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects a non-sentry op", async () => {
    mocks.findUnique.mockResolvedValue({ payload: { source: { type: "grid" } } });
    const { confirm, result } = run();
    await expect(result).resolves.toMatchObject({ ok: false, status: 400 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns 409 when the row is no longer open", async () => {
    mocks.queryRaw.mockResolvedValue([{ state: "created" }]);
    const { confirm, result } = run();
    await expect(result).resolves.toEqual({ ok: false, status: 409, error: MSG_NOT_OPEN });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns 409 when another op for the row is already queued (second click / second admin)", async () => {
    mocks.findFirst.mockResolvedValue({ id: "op-0" });
    const { confirm, result } = run();
    await expect(result).resolves.toEqual({ ok: false, status: 409, error: MSG_INFLIGHT });
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the row is gone", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const { result } = run();
    await expect(result).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it("propagates confirm errors for the route to map", async () => {
    const { result } = run(vi.fn().mockRejectedValue(new Error("Thao tác này đã được xác nhận trước đó")));
    await expect(result).rejects.toThrow("đã được xác nhận");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
