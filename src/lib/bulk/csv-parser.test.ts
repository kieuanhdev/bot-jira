import { describe, it, expect } from "vitest";
import {
  parseBulkCreateCsv,
  parseDelimitedText,
  isValidIsoDate,
  parseStrictPoints,
} from "./csv-parser";

describe("CSV / TSV Parser & Strict Validations", () => {
  describe("Date Validation (isValidIsoDate)", () => {
    it("accepts valid calendar dates", () => {
      expect(isValidIsoDate("2026-10-10")).toBe(true);
      expect(isValidIsoDate("2024-02-29")).toBe(true); // 2024 is a leap year
      expect(isValidIsoDate("2026-01-31")).toBe(true);
      expect(isValidIsoDate("2026-04-30")).toBe(true);
    });

    it("rejects non-existent calendar dates", () => {
      expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 is NOT a leap year
      expect(isValidIsoDate("2026-02-31")).toBe(false);
      expect(isValidIsoDate("2026-04-31")).toBe(false); // April has 30 days
      expect(isValidIsoDate("2026-13-01")).toBe(false); // Invalid month
      expect(isValidIsoDate("2026-00-10")).toBe(false);
      expect(isValidIsoDate("invalid-date")).toBe(false);
      expect(isValidIsoDate("2026/10/10")).toBe(false);
    });
  });

  describe("Points Validation (parseStrictPoints)", () => {
    it("accepts valid non-negative integer points", () => {
      expect(parseStrictPoints("0")).toEqual({ ok: true, points: 0 });
      expect(parseStrictPoints("3")).toEqual({ ok: true, points: 3 });
      expect(parseStrictPoints(" 13 ")).toEqual({ ok: true, points: 13 });
    });

    it("rejects floats, negatives, and strings with suffix/prefix", () => {
      expect(parseStrictPoints("3.5").ok).toBe(false);
      expect(parseStrictPoints("-1").ok).toBe(false);
      expect(parseStrictPoints("3abc").ok).toBe(false);
      expect(parseStrictPoints("abc3").ok).toBe(false);
      expect(parseStrictPoints("abc").ok).toBe(false);
      expect(parseStrictPoints("").ok).toBe(false);
    });
  });

  describe("Delimiter & Encoding Parsing", () => {
    it("tokenizes delimited text into string matrix using parseDelimitedText", () => {
      const raw = `a,b,c\n1,2,3`;
      const rows = parseDelimitedText(raw);
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });

    it("parses comma-separated values (CSV)", () => {
      const csv = `summary,issueType,priority\nTask 1,Bug,High\nTask 2,Task,Low`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(2);
      expect(res.items.length).toBe(2);
      expect(res.items[0].summary).toBe("Task 1");
      expect(res.items[0].issueTypeId).toBe("Bug");
      expect(res.items[0].priorityId).toBe("High");
    });

    it("parses semicolon-separated values", () => {
      const csv = `summary;issueType;priority\nTask A;Bug;Highest\nTask B;Task;Medium`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(2);
      expect(res.items[0].summary).toBe("Task A");
      expect(res.items[0].issueTypeId).toBe("Bug");
    });

    it("parses tab-separated values (TSV / Paste from Excel)", () => {
      const tsv = `summary\tissueType\tdescription\nExcel Task 1\tTask\tMô tả 1\nExcel Task 2\tBug\tMô tả 2`;
      const res = parseBulkCreateCsv(tsv);
      expect(res.validCount).toBe(2);
      expect(res.items[0].summary).toBe("Excel Task 1");
      expect(res.items[1].summary).toBe("Excel Task 2");
    });

    it("handles UTF-8 BOM and Vietnamese text without corruption", () => {
      const withBom =
        "\uFEFF" +
        `Tiêu đề,Loại task,Mô tả,Mức ưu tiên\nThiết kế API hệ thống,Task,Mô tả kiểm thử tiếng Việt có dấu,Cao`;
      const res = parseBulkCreateCsv(withBom);
      expect(res.validCount).toBe(1);
      expect(res.items[0].summary).toBe("Thiết kế API hệ thống");
      expect(res.items[0].issueTypeId).toBe("Task");
      expect(res.items[0].description).toBe("Mô tả kiểm thử tiếng Việt có dấu");
      expect(res.items[0].priorityId).toBe("Cao");
    });

    it("handles quoted cells with commas, escaped quotes, and newlines", () => {
      const csv = `summary,description\n"Task with, comma","Line 1\nLine 2 with ""quotes"""`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(1);
      expect(res.items[0].summary).toBe("Task with, comma");
      expect(res.items[0].description).toBe('Line 1\nLine 2 with "quotes"');
    });

    it("detects unclosed quotes and adds a descriptive warning", () => {
      const csv = `summary,description\n"Unclosed quote task,description`;
      const res = parseBulkCreateCsv(csv);
      expect(res.warnings.some((w) => w.includes("chưa được đóng"))).toBe(true);
    });
  });

  describe("Header Recognition & Aliases", () => {
    it("recognizes Vietnamese and English header aliases", () => {
      const csv = `mã,tiêu đề,loại,mô tả,gán cho,độ ưu tiên,nhãn,điểm,hạn chót,phiên bản\n` +
        `TASK-99,Tác vụ thử nghiệm,Bug,Chi tiết,admin,High,"tag1,tag2",5,2026-10-10,"Release 1"`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(1);
      const item = res.items[0];
      expect(item.clientRef).toBe("TASK-99");
      expect(item.summary).toBe("Tác vụ thử nghiệm");
      expect(item.issueTypeId).toBe("Bug");
      expect(item.description).toBe("Chi tiết");
      expect(item.assignee).toBe("admin");
      expect(item.priorityId).toBe("High");
      expect(item.labels).toEqual(["tag1", "tag2"]);
      expect(item.points).toBe(5);
      expect(item.dueDate).toBe("2026-10-10");
      expect(item.fixVersionIds).toEqual(["Release 1"]);
    });

    it("tracks unrecognized headers", () => {
      const csv = `summary,UnknownCol1,priority,AnotherUnknown\nTask A,Val1,High,Val2`;
      const res = parseBulkCreateCsv(csv);
      expect(res.unrecognizedHeaders).toEqual(["UnknownCol1", "AnotherUnknown"]);
    });

    it("warns about duplicate canonical headers", () => {
      const csv = `summary,tiêu đề,priority\nTask English,Task Vietnamese,High`;
      const res = parseBulkCreateCsv(csv);
      expect(res.duplicateCanonicalHeaders).toContain("tiêu đề");
      expect(res.warnings.some((w) => w.includes("bị trùng"))).toBe(true);
    });

    it("rejects import when summary header is missing but other headers are recognized", () => {
      const csv = `issueType,description,priority\nTask,Some description,High`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(0);
      expect(res.errors.some((e) => e.message.includes('cột bắt buộc "summary"'))).toBe(true);
    });

    it("falls back to column 1 as summary when no recognized headers exist (raw pasted table)", () => {
      const rawPasted = `Simple Task 1\nSimple Task 2`;
      const res = parseBulkCreateCsv(rawPasted);
      expect(res.validCount).toBe(2);
      expect(res.items[0].summary).toBe("Simple Task 1");
      expect(res.items[1].summary).toBe("Simple Task 2");
    });
  });

  describe("Row Error & Empty Row Handling", () => {
    it("marks row without summary as an error with exact line number instead of silently dropping", () => {
      const csv = `summary,issueType,description\nValid Task,Task,Desc 1\n,Bug,Missing summary description\nAnother Valid,Task,Desc 3`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(2);
      expect(res.errorCount).toBe(1);
      expect(res.errors.length).toBe(1);
      expect(res.errors[0].line).toBe(3); // Line 3 has missing summary
      expect(res.errors[0].message).toContain("Thiếu tiêu đề (Summary)");
      expect(res.items.map((i) => i.summary)).toEqual(["Valid Task", "Another Valid"]);
    });

    it("rejects rows with invalid date or invalid points format and records line errors", () => {
      const csv = `summary,points,dueDate\nTask 1,3abc,2026-10-10\nTask 2,5,2026-02-31`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(0);
      expect(res.errorCount).toBe(2);
      expect(res.errors.some((e) => e.message.includes("Points"))).toBe(true);
      expect(res.errors.some((e) => e.message.includes("Hạn chót"))).toBe(true);
    });

    it("skips completely blank rows without counting them as errors", () => {
      const csv = `summary,issueType\nTask 1,Task\n   ,   \n\nTask 2,Bug`;
      const res = parseBulkCreateCsv(csv);
      expect(res.validCount).toBe(2);
      expect(res.errorCount).toBe(0);
      expect(res.skippedEmptyCount).toBeGreaterThan(0);
    });

    it("handles empty or whitespace-only files gracefully", () => {
      const res = parseBulkCreateCsv("   \n\n  ");
      expect(res.validCount).toBe(0);
      expect(res.totalRows).toBe(0);
      expect(res.warnings).toContain("Tệp hoặc dữ liệu trống");
    });
  });

  describe("Capacity & Overflow Limits", () => {
    it("respects maxItems limit and counts overflow rows", () => {
      const rows = ["summary,priority"];
      for (let i = 1; i <= 105; i++) {
        rows.push(`Task ${i},High`);
      }
      const csv = rows.join("\n");
      const res = parseBulkCreateCsv(csv, undefined, 100);

      expect(res.items.length).toBe(100);
      expect(res.validCount).toBe(100);
      expect(res.overflowCount).toBe(5);
      expect(res.warnings.some((w) => w.includes("vượt quá giới hạn tối đa 100"))).toBe(true);
    });
  });

  describe("Unique clientRef Generation", () => {
    it("generates unique clientRefs for items without clientRef in file", () => {
      const csv = `summary\nTask 1\nTask 2\nTask 3`;
      const res = parseBulkCreateCsv(csv);
      const refs = res.items.map((i) => i.clientRef);
      expect(new Set(refs).size).toBe(3);
    });

    it("deduplicates clientRefs if file contains duplicate clientRef values", () => {
      const csv = `clientRef,summary\nTASK-1,Task 1\nTASK-1,Task 2`;
      const res = parseBulkCreateCsv(csv);
      expect(res.items[0].clientRef).toBe("TASK-1");
      expect(res.items[1].clientRef).toBe("TASK-1-2");
      expect(res.warnings.some((w) => w.includes("bị trùng lặp"))).toBe(true);
    });
  });
});
