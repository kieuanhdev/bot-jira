import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleWebhook, _resetWebhookRateLimits } from "./_shared";
import { verifyWebhookSignature } from "@/lib/events/signatures";
import { ingestEvent } from "@/lib/events/store";
import { logSwallowed } from "@/lib/logger";

vi.mock("@/lib/events/signatures", () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/events/store", () => ({
  ingestEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logSwallowed: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queue/boss", () => ({
  enqueueWebhookEvent: enqueueMock,
}));

describe("handleWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWebhookRateLimits();
    vi.mocked(verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(ingestEvent).mockResolvedValue({ duplicate: false, stored: true, eventId: "evt-123" });
    enqueueMock.mockResolvedValue(undefined);
  });

  it("returns 401 if signature is invalid", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(false);

    const req = new Request("http://localhost/api/webhooks/ci", {
      method: "POST",
      body: JSON.stringify({ runId: "1" }),
    });

    const res = await handleWebhook("ci", req, () => ({
      externalId: "ext-1",
      type: "ci:success",
    }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: "invalid signature" });
    expect(ingestEvent).not.toHaveBeenCalled();
  });

  it("returns 400 if JSON is malformed", async () => {
    const req = new Request("http://localhost/api/webhooks/ci", {
      method: "POST",
      body: "{malformed json",
    });

    const res = await handleWebhook("ci", req, () => ({
      externalId: "ext-1",
      type: "ci:success",
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "invalid json" });
  });

  it("returns 400 if extract returns null", async () => {
    const req = new Request("http://localhost/api/webhooks/ci", {
      method: "POST",
      body: JSON.stringify({ invalid: true }),
    });

    const res = await handleWebhook("ci", req, () => null);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "invalid payload" });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const makeReq = () =>
      new Request("http://localhost/api/webhooks/ci", {
        method: "POST",
        body: JSON.stringify({ runId: "1" }),
      });

    // Exhaust 100 requests limit
    for (let i = 0; i < 100; i++) {
      const okRes = await handleWebhook("ci", makeReq(), () => ({
        externalId: `ext-${i}`,
        type: "ci:run",
      }));
      expect(okRes.status).toBe(200);
    }

    // 101st request should be rate limited
    const res = await handleWebhook("ci", makeReq(), () => ({
      externalId: "ext-101",
      type: "ci:run",
    }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const json = await res.json();
    expect(json).toEqual({ error: "rate limited" });
  });

  it("returns 200 with duplicate: true if event was already ingested", async () => {
    vi.mocked(ingestEvent).mockResolvedValue({ duplicate: true, stored: false });

    const req = new Request("http://localhost/api/webhooks/jira", {
      method: "POST",
      body: JSON.stringify({ issue: { key: "PROJ-1" } }),
    });

    const res = await handleWebhook("jira", req, () => ({
      externalId: "jira:PROJ-1",
      type: "jira:issue_updated",
      subject: "PROJ-1",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, duplicate: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("returns 500 if event storing fails", async () => {
    vi.mocked(ingestEvent).mockResolvedValue({ duplicate: false, stored: false });

    const req = new Request("http://localhost/api/webhooks/jira", {
      method: "POST",
      body: JSON.stringify({ issue: { key: "PROJ-1" } }),
    });

    const res = await handleWebhook("jira", req, () => ({
      externalId: "jira:PROJ-1",
      type: "jira:issue_updated",
    }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: "failed to store event" });
  });

  it("ingests event, enqueues worker job and returns 200 ok on success", async () => {
    const payload = { issue: { key: "PROJ-1" } };
    const req = new Request("http://localhost/api/webhooks/jira", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const res = await handleWebhook("jira", req, () => ({
      externalId: "jira:PROJ-1",
      type: "jira:issue_updated",
      subject: "PROJ-1",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(ingestEvent).toHaveBeenCalledWith({
      source: "jira",
      externalId: "jira:PROJ-1",
      type: "jira:issue_updated",
      subject: "PROJ-1",
      payload,
    });
    expect(enqueueMock).toHaveBeenCalledWith({ source: "jira", eventId: "evt-123" });
  });

  it("logs swallowed error and still returns 200 if enqueuing fails", async () => {
    const queueError = new Error("queue connection failed");
    enqueueMock.mockRejectedValue(queueError);

    const req = new Request("http://localhost/api/webhooks/jira", {
      method: "POST",
      body: JSON.stringify({ issue: { key: "PROJ-1" } }),
    });

    const res = await handleWebhook("jira", req, () => ({
      externalId: "jira:PROJ-1",
      type: "jira:issue_updated",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(logSwallowed).toHaveBeenCalledWith("jira_webhook_enqueue", queueError, {
      eventId: "evt-123",
    });
  });
});
