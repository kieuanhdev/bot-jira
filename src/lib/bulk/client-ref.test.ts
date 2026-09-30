import { describe, it, expect } from "vitest";
import {
  generateUniqueClientRef,
  ensureUniqueClientRefs,
  filterBlankPlaceholderItems,
} from "./client-ref";
import type { BulkCreateRowInput } from "./create-types";

describe("client-ref utilities", () => {
  it("generates unique clientRefs when refs already exist", () => {
    const existing = new Set(["row-1", "row-2"]);
    const ref1 = generateUniqueClientRef(existing, "row");
    expect(ref1).toBe("row-3");
    expect(existing.has("row-3")).toBe(true);

    const ref2 = generateUniqueClientRef(existing, "row");
    expect(ref2).toBe("row-4");
  });

  it("handles gaps and conflicts in existing refs", () => {
    const existing = new Set(["row-1", "row-3"]);
    const ref = generateUniqueClientRef(existing, "row");
    expect(ref).toBe("row-2"); // fills the gap
  });

  it("ensures all items have unique clientRef values and deduplicates conflicts", () => {
    const items: BulkCreateRowInput[] = [
      { clientRef: "TASK-1", summary: "Task 1" },
      { clientRef: "TASK-1", summary: "Duplicate Task 1" },
      { clientRef: "", summary: "Empty ref task" },
      { clientRef: "TASK-1-2", summary: "Pre-existing suffix" },
      { clientRef: "TASK-1", summary: "Third duplicate" },
    ];

    const result = ensureUniqueClientRefs(items);
    const refs = result.map((r) => r.clientRef);
    const uniqueRefs = new Set(refs);

    expect(refs.length).toBe(uniqueRefs.size);
    expect(refs[0]).toBe("TASK-1");
    // Duplicate TASK-1 should become TASK-1-3 because TASK-1-2 exists
    expect(uniqueRefs.has("TASK-1")).toBe(true);
    expect(uniqueRefs.has("TASK-1-2")).toBe(true);
    expect(uniqueRefs.has("TASK-1-3")).toBe(true);
  });

  it("filters out blank placeholder items with no meaningful content", () => {
    const items: BulkCreateRowInput[] = [
      { clientRef: "row-1", summary: "" },
      { clientRef: "row-2", summary: "   " },
      { clientRef: "row-3", summary: "Valid task" },
      { clientRef: "row-4", summary: "", description: "Has description" },
      { clientRef: "row-5", summary: "", points: 3 },
    ];

    const filtered = filterBlankPlaceholderItems(items);
    expect(filtered.length).toBe(3);
    expect(filtered.map((f) => f.clientRef)).toEqual(["row-3", "row-4", "row-5"]);
  });
});
