import { describe, it, expect } from "vitest";
import {
  createInitialRows,
  filterFilledItems,
  countFilledItems,
  hasDraftContent,
  filterDiscardBlockedRows,
  sanitizeItemsForProjectChange,
  resolveDraftStatus,
  canAutosaveDraft,
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

  describe("resolveDraftStatus", () => {
    it("returns 'ready' for null, empty or invalid json", () => {
      expect(resolveDraftStatus(null)).toBe("ready");
      expect(resolveDraftStatus("")).toBe("ready");
      expect(resolveDraftStatus("invalid json{")).toBe("ready");
      expect(resolveDraftStatus(JSON.stringify({}))).toBe("ready");
      expect(resolveDraftStatus(JSON.stringify({ items: [] }))).toBe("ready");
    });

    it("returns 'ready' when all rows have blank summaries", () => {
      const raw = JSON.stringify({
        items: [{ summary: "" }, { summary: "   " }, { summary: null }],
      });
      expect(resolveDraftStatus(raw)).toBe("ready");
    });

    it("returns 'pending-decision' when at least one row has meaningful summary", () => {
      const raw = JSON.stringify({
        items: [{ summary: " " }, { summary: "Prepare release" }],
      });
      expect(resolveDraftStatus(raw)).toBe("pending-decision");
    });
  });

  describe("canAutosaveDraft", () => {
    const baseInput = {
      draftOwner: "PROJ",
      projectKey: "PROJ",
      status: "ready" as const,
      handoffActive: false,
      step: "input" as const,
    };

    it("allows autosave under normal input step with matching project and ready status", () => {
      expect(canAutosaveDraft(baseInput)).toBe(true);
    });

    it("prevents autosave when draftOwner does not match projectKey", () => {
      expect(canAutosaveDraft({ ...baseInput, draftOwner: "OTHER" })).toBe(false);
      expect(canAutosaveDraft({ ...baseInput, draftOwner: null })).toBe(false);
    });

    it("prevents autosave when status is pending-decision", () => {
      expect(canAutosaveDraft({ ...baseInput, status: "pending-decision" })).toBe(false);
    });

    it("prevents autosave when handoff is active", () => {
      expect(canAutosaveDraft({ ...baseInput, handoffActive: true })).toBe(false);
    });

    it("prevents autosave outside input step", () => {
      expect(canAutosaveDraft({ ...baseInput, step: "preview" })).toBe(false);
      expect(canAutosaveDraft({ ...baseInput, step: "progress" })).toBe(false);
    });
  });
});
