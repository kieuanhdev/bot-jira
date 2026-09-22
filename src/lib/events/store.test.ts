import { describe, expect, it } from "vitest";
import { capPayload } from "./store";

describe("capPayload", () => {
  it("passes small payloads through unchanged", () => {
    const { payload, truncated } = capPayload({ a: 1, b: "x" });
    expect(truncated).toBe(false);
    expect(payload).toEqual({ a: 1, b: "x" });
  });

  it("truncates oversized payloads", () => {
    const big = { data: "x".repeat(200_000) };
    const { payload, truncated } = capPayload(big);
    expect(truncated).toBe(true);
    const p = payload as { truncated?: boolean };
    expect(p.truncated).toBe(true);
  });

  it("handles unserializable payloads without throwing", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const { payload, truncated } = capPayload(obj);
    // JSON.stringify of a circular object throws; we store a safe marker.
    expect(payload).toBeTruthy();
    void truncated;
  });
});
