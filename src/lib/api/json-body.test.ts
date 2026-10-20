import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJsonBody } from "./json-body";

const SampleSchema = z.object({ name: z.string(), count: z.number() });
const RoleSchema = z.object({ role: z.enum(["admin", "member"]) });
const OptionalSchema = z.object({ note: z.string().optional() });

describe("readJsonBody", () => {
  it("parses valid JSON matching schema", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hello", count: 42 }),
    });

    const result = await readJsonBody(req, SampleSchema);
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

    const result = await readJsonBody(req, SampleSchema);
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

    const result = await readJsonBody(req, SampleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_json" });
    }
  });

  it("returns 400 invalid_body with issues when JSON does not match schema", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superadmin" }),
    });

    const result = await readJsonBody(req, RoleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: "invalid_body",
        issues: [{ path: "role", message: expect.any(String) }],
      });
    }
  });

  it("joins nested issue paths with dots", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outer: { inner: 1 } }),
    });

    const result = await readJsonBody(req, z.object({ outer: z.object({ inner: z.string() }) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = await result.response.json();
      expect(json.issues).toEqual([{ path: "outer.inner", message: expect.any(String) }]);
    }
  });

  it("parses an empty body as {} when allowEmpty is set", async () => {
    const req = new Request("http://localhost/api/test", { method: "POST", body: "" });

    const result = await readJsonBody(req, OptionalSchema, { allowEmpty: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it("parses a body-less request as {} when allowEmpty is set", async () => {
    const req = new Request("http://localhost/api/test", { method: "POST" });

    const result = await readJsonBody(req, OptionalSchema, { allowEmpty: true });
    expect(result).toEqual({ ok: true, data: {} });
  });

  it("returns invalid_json on empty body without allowEmpty even when {} would parse", async () => {
    const req = new Request("http://localhost/api/test", { method: "POST", body: "" });

    const result = await readJsonBody(req, OptionalSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_json" });
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

    const result = await readJsonBody(req, SampleSchema, { maxBytes: 100 });
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

    const result = await readJsonBody(req, SampleSchema, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "payload_too_large" });
    }
  });
});
