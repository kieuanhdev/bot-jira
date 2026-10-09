import { describe, it, expect } from "vitest";
import {
  createInitialRows,
  filterFilledItems,
  countFilledItems,
  hasDraftContent,
  filterDiscardBlockedRows,
  sanitizeItemsForProjectChange,
} from "./bulk-create-controller-model";
import type { BulkCreateRowInput } from "@/lib/bulk/create-types";

describe("bulk-create-controller-model", () => {
  it("generates default initial rows", () => {
    const rows = createInitialRows(3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ clientRef: "row-1", summary: "" });
    expect(rows[2]).toEqual({ clientRef: "row-3", summary: "" });
  });

  it("filters and counts filled items ignoring whitespace", () => {
    const items: BulkCreateRowInput[] = [
      { clientRef: "1", summary: "  Task A  " },
      { clientRef: "2", summary: "   " },
      { clientRef: "3", summary: "Task B" },
      { clientRef: "4", summary: "" },
    ];
    const filled = filterFilledItems(items);
    expect(filled).toHaveLength(2);
    expect(filled.map((i) => i.summary.trim())).toEqual(["Task A", "Task B"]);
    expect(countFilledItems(items)).toBe(2);
  });

  it("identifies whether draft has meaningful content", () => {
    expect(hasDraftContent([{ clientRef: "1", summary: "" }], {})).toBe(false);
    expect(hasDraftContent([{ clientRef: "1", summary: "   " }], {})).toBe(false);
    expect(hasDraftContent([{ clientRef: "1", summary: "Deploy v2" }], {})).toBe(true);
    expect(hasDraftContent([{ clientRef: "1", summary: "" }], { priorityId: "2" })).toBe(true);
  });

  it("discards blocked rows and returns remaining or fallback rows", () => {
    const items: BulkCreateRowInput[] = [
      { clientRef: "r1", summary: "Valid 1" },
      { clientRef: "r2", summary: "Blocked 2" },
      { clientRef: "r3", summary: "Valid 3" },
    ];
    const previewItems = [
      { rowIndex: 0, classification: "ready" },
      { rowIndex: 1, classification: "blocked" },
      { rowIndex: 2, classification: "ready" },
    ];

    const result = filterDiscardBlockedRows(items, previewItems);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.summary)).toEqual(["Valid 1", "Valid 3"]);

    // If all are blocked, falls back to 3 clean rows
    const allBlockedResult = filterDiscardBlockedRows(
      [{ clientRef: "r1", summary: "Bad" }],
      [{ rowIndex: 0, classification: "blocked" }]
    );
    expect(allBlockedResult).toHaveLength(3);
    expect(allBlockedResult[0].summary).toBe("");
  });

  it("sanitizes project-specific fields on project change", () => {
    const items: BulkCreateRowInput[] = [
      {
        clientRef: "r1",
        summary: "Keep me",
        description: "Keep desc",
        issueTypeId: "10001",
        priorityId: "3",
        fixVersionIds: ["100"],
        points: 5,
        labels: ["backend"],
      },
    ];

    const sanitized = sanitizeItemsForProjectChange(items);
    expect(sanitized[0].summary).toBe("Keep me");
    expect(sanitized[0].description).toBe("Keep desc");
    expect(sanitized[0].points).toBe(5);
    expect(sanitized[0].labels).toEqual(["backend"]);
    expect(sanitized[0].issueTypeId).toBeUndefined();
    expect(sanitized[0].priorityId).toBeUndefined();
    expect(sanitized[0].fixVersionIds).toBeUndefined();
  });
});
