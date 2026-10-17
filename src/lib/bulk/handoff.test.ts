import { describe, expect, it } from "vitest";
import type { BulkCreateRowInput } from "./create-types";
import { HANDOFF_KEY_PREFIX, HANDOFF_TTL_MS, readHandoff, writeHandoff, type HandoffStorage } from "./handoff";

function memoryStorage(): HandoffStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStorage: HandoffStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const items: BulkCreateRowInput[] = [
  { clientRef: "row-1", summary: "Làm UI", parent: { type: "jira", jiraKey: "ABC-1" }, issueTypeId: "10003" },
  { clientRef: "row-2", summary: "Làm API", parent: { type: "jira", jiraKey: "ABC-1" }, issueTypeId: "10003" },
];

describe("handoff", () => {
  it("round-trips once, then returns null", () => {
    const storage = memoryStorage();
    const id = writeHandoff("ABC", items, storage);
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(storage.data.has(`${HANDOFF_KEY_PREFIX}${id}`)).toBe(true);

    expect(readHandoff(id, storage)).toEqual({ projectKey: "ABC", items });
    expect(readHandoff(id, storage)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("returns null and does not crash when storage throws", () => {
    expect(readHandoff("abcd1234", throwingStorage)).toBeNull();
  });

  it("throws a readable error when the write fails", () => {
    expect(() => writeHandoff("ABC", items, throwingStorage)).toThrow(/sub-task/);
  });

  it("expires after 30 minutes", () => {
    const storage = memoryStorage();
    const id = writeHandoff("ABC", items, storage, 1_000);
    expect(readHandoff(id, storage, 1_000 + HANDOFF_TTL_MS + 1)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("rejects malformed payloads and ids", () => {
    const storage = memoryStorage();
    storage.setItem(`${HANDOFF_KEY_PREFIX}abcd1234`, JSON.stringify({ projectKey: "ABC", items: [{ foo: 1 }], savedAt: Date.now() }));
    expect(readHandoff("abcd1234", storage)).toBeNull();
    storage.setItem(`${HANDOFF_KEY_PREFIX}abcd1235`, "{not json");
    expect(readHandoff("abcd1235", storage)).toBeNull();
    storage.setItem(`${HANDOFF_KEY_PREFIX}abcd1236`, JSON.stringify({ projectKey: "ABC", items: [], savedAt: Date.now() }));
    expect(readHandoff("abcd1236", storage)).toBeNull();
    expect(readHandoff("../evil", storage)).toBeNull();
  });
});
