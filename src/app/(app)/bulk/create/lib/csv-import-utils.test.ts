import { describe, expect, it } from "vitest";
import {
  validateImportFile,
  calcRemainingCapacity,
  generateCsvTemplate,
  resolveCsvNamesToIds,
  MAX_FILE_SIZE_BYTES,
} from "./csv-import-utils";
import { MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";

describe("csv-import-utils", () => {
  describe("validateImportFile", () => {
    it("rejects files exceeding max size", () => {
      const res = validateImportFile("large.csv", MAX_FILE_SIZE_BYTES + 1);
      expect(res.error).toContain("vượt quá dung lượng tối đa");
      expect(res.isExcel).toBe(false);
    });

    it("rejects unsupported extensions", () => {
      const res = validateImportFile("data.json", 1000);
      expect(res.error).toContain("không được hỗ trợ");
      expect(res.ext).toBe(".json");
      expect(res.isExcel).toBe(false);
    });

    it("identifies excel file correctly", () => {
      const res = validateImportFile("data.xlsx", 5000);
      expect(res.error).toBeUndefined();
      expect(res.ext).toBe(".xlsx");
      expect(res.isExcel).toBe(true);
    });

    it("identifies csv, tsv, txt correctly", () => {
      expect(validateImportFile("tasks.csv", 200).isExcel).toBe(false);
      expect(validateImportFile("tasks.tsv", 200).isExcel).toBe(false);
      expect(validateImportFile("tasks.txt", 200).isExcel).toBe(false);
    });
  });

  describe("calcRemainingCapacity", () => {
    it("returns MAX_BULK_CREATE_ITEMS for replace mode", () => {
      expect(calcRemainingCapacity("replace", 25)).toBe(MAX_BULK_CREATE_ITEMS);
    });

    it("returns difference for append mode", () => {
      expect(calcRemainingCapacity("append", 10)).toBe(MAX_BULK_CREATE_ITEMS - 10);
      expect(calcRemainingCapacity("append", MAX_BULK_CREATE_ITEMS + 5)).toBe(0);
    });
  });

  describe("generateCsvTemplate", () => {
    it("generates a CSV string with BOM and standard headers", () => {
      const csv = generateCsvTemplate();
      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("summary");
      expect(csv).toContain("clientRef");
      expect(csv).toContain("issueType");
      expect(csv).toContain("TASK-001");
    });
  });
});

describe("resolveCsvNamesToIds", () => {
  const metadata = {
    issueTypes: [{ id: "10001", name: "Task" }, { id: "10002", name: "Sub-task" }],
    priorityOptions: [{ id: "2", name: "High" }, { id: "3", name: "Medium" }],
  } as unknown as Parameters<typeof resolveCsvNamesToIds>[1];

  it("maps names (case-insensitive) to ids, keeps ids and unknown values", () => {
    const out = resolveCsvNamesToIds(
      [
        { clientRef: "a", summary: "x", issueTypeId: "task", priorityId: "HIGH" },
        { clientRef: "b", summary: "y", issueTypeId: "10002", priorityId: "Nope" },
      ] as never,
      metadata
    );
    expect(out[0].issueTypeId).toBe("10001");
    expect(out[0].priorityId).toBe("2");
    expect(out[1].issueTypeId).toBe("10002");
    expect(out[1].priorityId).toBe("Nope");
  });
});
