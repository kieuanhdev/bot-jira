import { describe, expect, it, vi, beforeEach } from "vitest";

// Stub the prisma client.
const state: { rows: Array<{ source: string; externalId: string }> } = { rows: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationEvent: {
      create: vi.fn(async (args: { data: { source: string; externalId: string } }) => {
        const existing = state.rows.find(
          (r) => r.source === args.data.source && r.externalId === args.data.externalId
        );
        if (existing) {
          const e = new Error("Unique constraint failed: P2002");
          (e as { code?: string }).code = "P2002";
          e.message = "P2002: Unique constraint failed on the fields: (`source`, `externalId`)";
          throw e;
        }
        const row = { id: `evt-${state.rows.length}`, ...args.data };
        state.rows.push(row as never);
        return row;
      }),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { webhookMaxPayloadBytes: 64 * 1024 },
}));

import { ingestEvent } from "./store";

describe("ingestEvent", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("stores a new event and returns its id", async () => {
    const result = await ingestEvent({
      source: "jira",
      externalId: "abc",
      type: "jira:issue_updated",
      payload: { a: 1 },
    });
    expect(result.stored).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.eventId).toBeTruthy();
  });

  it("detects a duplicate (source, externalId)", async () => {
    await ingestEvent({ source: "jira", externalId: "abc", type: "t", payload: {} });
    const second = await ingestEvent({ source: "jira", externalId: "abc", type: "t", payload: {} });
    expect(second.duplicate).toBe(true);
    expect(second.stored).toBe(false);
  });

  it("treats the same externalId from a different source as distinct", async () => {
    await ingestEvent({ source: "jira", externalId: "abc", type: "t", payload: {} });
    const other = await ingestEvent({ source: "ci", externalId: "abc", type: "t", payload: {} });
    expect(other.duplicate).toBe(false);
    expect(other.stored).toBe(true);
  });
});
