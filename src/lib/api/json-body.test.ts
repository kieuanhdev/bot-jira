import { describe, expect, it } from "vitest";
import { readJsonBody } from "./json-body";

type SamplePayload = {
  name: string;
  count: number;
};

function isSamplePayload(v: unknown): v is SamplePayload {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.count === "number";
}

describe("readJsonBody", () => {
  it("parses valid JSON matching type guard", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hello", count: 42 }),
    });

    const result = await readJsonBody(req, isSamplePayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "hello", count: 42 });
    }
  });

  it("returns 400 invalid_json on empty body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    const result = await readJsonBody(req, isSamplePayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_json" });
    }
  });

  it("returns 400 invalid_json on malformed JSON", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });

    const result = await readJsonBody(req, isSamplePayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_json" });
    }
  });

  it("returns 400 invalid_body when JSON does not match guard", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hello", count: "not-a-number" }),
    });

    const result = await readJsonBody(req, isSamplePayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_body" });
    }
  });

  it("returns 400 payload_too_large when Content-Length exceeds maxBytes", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "1000",
      },
      body: JSON.stringify({ name: "hello", count: 1 }),
    });

    const result = await readJsonBody(req, isSamplePayload, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "payload_too_large" });
    }
  });

  it("returns 400 payload_too_large when stream body exceeds maxBytes", async () => {
    // Stream chunks that together exceed maxBytes without setting Content-Length
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"name": "'));
        controller.enqueue(new TextEncoder().encode("a".repeat(150)));
        controller.enqueue(new TextEncoder().encode('", "count": 1}'));
        controller.close();
      },
    });

    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as unknown as RequestInit);

    const result = await readJsonBody(req, isSamplePayload, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "payload_too_large" });
    }
  });
});
