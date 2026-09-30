import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api-client";

describe("Bulk Create - UI to API Contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends single JSON-stringified object in preview request", async () => {
    let capturedBody: string | undefined;
    let capturedHeaders: HeadersInit | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = init?.body as string;
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            operationId: "op-123",
            type: "create-issues",
            total: 1,
            actionable: 1,
            blocked: 0,
            metadataFingerprint: "fp-123",
            items: [],
          }),
        };
      })
    );

    const payload = {
      projectKey: "EPM",
      defaults: { priorityId: "High" },
      items: [{ clientRef: "row-1", summary: "My Task" }],
      metadataFingerprint: "fp-123",
      source: { type: "grid" as const },
    };

    // Correct contract: pass raw object to api helper
    const result = await api("/api/bulk/create", {
      method: "POST",
      body: payload,
    });

    expect(result).toHaveProperty("operationId", "op-123");
    expect(capturedHeaders).toEqual({ "Content-Type": "application/json" });

    // The body sent over wire must be parseable ONCE into an object, NOT a JSON string
    expect(typeof capturedBody).toBe("string");
    const parsedOnce = JSON.parse(capturedBody!);
    expect(typeof parsedOnce).toBe("object");
    expect(parsedOnce.projectKey).toBe("EPM");
    expect(parsedOnce.items).toHaveLength(1);
    expect(parsedOnce.items[0].summary).toBe("My Task");

    // If double-stringified, parsedOnce would be a string, and JSON.parse(parsedOnce) would be required
    expect(typeof parsedOnce).not.toBe("string");
  });

  it("sends single JSON-stringified object in confirm request", async () => {
    let capturedBody: string | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = init?.body as string;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            operationId: "op-123",
            queued: true,
          }),
        };
      })
    );

    const confirmPayload = {
      confirm: true,
      operationId: "op-123",
    };

    const res = await api("/api/bulk/create", {
      method: "POST",
      body: confirmPayload,
    });

    expect(res).toHaveProperty("operationId", "op-123");
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toEqual({
      confirm: true,
      operationId: "op-123",
    });
    expect(typeof parsed).toBe("object");
  });

  it("sends single JSON-stringified object in retry request", async () => {
    let capturedBody: string | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, init) => {
        capturedBody = init?.body as string;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            queued: true,
            operationId: "op-123",
            retried: 2,
          }),
        };
      })
    );

    const retryPayload = {
      itemIds: ["item-1", "item-2"],
    };

    const res = await api("/api/bulk/operations/op-123/retry", {
      method: "POST",
      body: retryPayload,
    });

    expect(res).toHaveProperty("retried", 2);
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toEqual({
      itemIds: ["item-1", "item-2"],
    });
  });

  it("handles 400/409/428 errors and surfaces error message correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Thao tác đã được xác nhận trước đó.",
        }),
      }))
    );

    await expect(
      api("/api/bulk/create", {
        method: "POST",
        body: { confirm: true, operationId: "op-123" },
      })
    ).rejects.toThrow("Thao tác đã được xác nhận trước đó.");
  });
});
