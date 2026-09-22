import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify/push", () => ({ sendPush: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { notifyBackoffBaseMs: 60_000 } }));

import { dedupeKeyFor, backoffMs } from "./outbox";

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
