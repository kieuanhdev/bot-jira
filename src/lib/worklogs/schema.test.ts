import { describe, it, expect } from "vitest";
import {
  parseJiraDuration,
  formatJiraDuration,
  formatJiraStartedAt,
  validateCreateWorklogInput,
  computeWorklogRequestHash,
  isSafeReturnUrl,
} from "./schema";

describe("Worklog Schema & Utilities", () => {
  describe("parseJiraDuration", () => {
    it("parses single unit durations", () => {
      expect(parseJiraDuration("30m")).toBe(1800);
      expect(parseJiraDuration("2h")).toBe(7200);
      expect(parseJiraDuration("1d")).toBe(28800);
      expect(parseJiraDuration("1w")).toBe(144000);
    });

    it("parses combined unit durations with arbitrary spaces", () => {
      expect(parseJiraDuration("1d 4h")).toBe(28800 + 14400);
      expect(parseJiraDuration("2h 30m")).toBe(7200 + 1800);
      expect(parseJiraDuration("1w 2d 3h 15m")).toBe(144000 + 2 * 28800 + 3 * 3600 + 15 * 60);
      expect(parseJiraDuration("  4h   10m  ")).toBe(14400 + 600);
    });

    it("is case-insensitive", () => {
      expect(parseJiraDuration("1D 4H")).toBe(28800 + 14400);
      expect(parseJiraDuration("30M")).toBe(1800);
      expect(parseJiraDuration("1W")).toBe(144000);
    });

    it("returns null for invalid inputs or 0 duration", () => {
      expect(parseJiraDuration(null)).toBeNull();
      expect(parseJiraDuration("")).toBeNull();
      expect(parseJiraDuration("0m")).toBeNull();
      expect(parseJiraDuration("0h")).toBeNull();
      expect(parseJiraDuration("-5m")).toBeNull();
      expect(parseJiraDuration("abc")).toBeNull();
      expect(parseJiraDuration("2.5h")).toBeNull();
      expect(parseJiraDuration("2h 30s")).toBeNull(); // s not supported in Jira
    });
  });

  describe("formatJiraDuration", () => {
    it("formats seconds into Jira duration strings", () => {
      expect(formatJiraDuration(1800)).toBe("30m");
      expect(formatJiraDuration(7200)).toBe("2h");
      expect(formatJiraDuration(9000)).toBe("2h 30m");
      expect(formatJiraDuration(28800)).toBe("1d");
      expect(formatJiraDuration(43200)).toBe("1d 4h");
      expect(formatJiraDuration(144000)).toBe("1w");
      expect(formatJiraDuration(144000 + 28800 + 7200 + 300)).toBe("1w 1d 2h 5m");
    });

    it("handles 0 or negative seconds gracefully", () => {
      expect(formatJiraDuration(0)).toBe("0m");
      expect(formatJiraDuration(-100)).toBe("0m");
      expect(formatJiraDuration(null)).toBe("0m");
    });
  });

  describe("formatJiraStartedAt", () => {
    it("formats ISO string with timezone offset preserving local hour and offset", () => {
      expect(formatJiraStartedAt("2026-09-30T09:15:00+07:00")).toBe("2026-09-30T09:15:00.000+0700");
      expect(formatJiraStartedAt("2026-09-30T09:15:00.123+07:00")).toBe("2026-09-30T09:15:00.123+0700");
      expect(formatJiraStartedAt("2026-09-30T14:30:00-05:00")).toBe("2026-09-30T14:30:00.000-0500");
    });

    it("formats UTC ISO string with Z to +0000", () => {
      expect(formatJiraStartedAt("2026-09-30T09:15:00Z")).toBe("2026-09-30T09:15:00.000+0000");
    });

    it("formats simple date YYYY-MM-DD", () => {
      expect(formatJiraStartedAt("2026-09-30")).toBe("2026-09-30T09:00:00.000+0000");
    });

    it("formats Date object", () => {
      const d = new Date("2026-09-30T12:00:00.000Z");
      expect(formatJiraStartedAt(d)).toBe("2026-09-30T12:00:00.000+0000");
    });
  });

  describe("validateCreateWorklogInput", () => {
    const validPayload = {
      timeSpent: "2h 30m",
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      comment: "Fixing task standardization",
      adjustEstimate: "leave",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
    };

    it("accepts a valid payload", () => {
      const result = validateCreateWorklogInput(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeSpent).toBe("2h 30m");
        expect(result.data.adjustEstimate).toBe("leave");
        expect(result.data.idempotencyKey).toBe(validPayload.idempotencyKey);
      }
    });

    it("rejects missing or invalid duration", () => {
      const res1 = validateCreateWorklogInput({ ...validPayload, timeSpent: "" });
      expect(res1.success).toBe(false);
      if (!res1.success) expect(res1.code).toBe("INVALID_DURATION");

      const res2 = validateCreateWorklogInput({ ...validPayload, timeSpent: "invalid" });
      expect(res2.success).toBe(false);
      if (!res2.success) expect(res2.code).toBe("INVALID_DURATION");
    });

    it("rejects invalid startedAt", () => {
      const res = validateCreateWorklogInput({ ...validPayload, startedAt: "not-a-date" });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.code).toBe("INVALID_STARTED_AT");
    });

    it("rejects startedAt more than 5 minutes in the future", () => {
      const tenMinutesInFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const res = validateCreateWorklogInput({ ...validPayload, startedAt: tenMinutesInFuture });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.code).toBe("FUTURE_STARTED_AT");
    });

    it("allows startedAt within 5 minutes in the future (clock drift tolerance)", () => {
      const twoMinutesInFuture = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const res = validateCreateWorklogInput({ ...validPayload, startedAt: twoMinutesInFuture });
      expect(res.success).toBe(true);
    });

    it("rejects comment exceeding maximum length", () => {
      const longComment = "a".repeat(4001);
      const res = validateCreateWorklogInput({ ...validPayload, comment: longComment });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.code).toBe("COMMENT_TOO_LONG");
    });

    it("rejects adjustEstimate other than 'leave' in MVP", () => {
      const res = validateCreateWorklogInput({ ...validPayload, adjustEstimate: "auto" });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.code).toBe("INVALID_ADJUST_ESTIMATE");
    });

    it("rejects missing idempotencyKey", () => {
      const res = validateCreateWorklogInput({ ...validPayload, idempotencyKey: "" });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.code).toBe("INVALID_IDEMPOTENCY_KEY");
    });
  });

  describe("computeWorklogRequestHash", () => {
    it("produces identical hashes for identical inputs", () => {
      const input1 = {
        timeSpent: "2h",
        startedAt: "2026-09-30T10:00:00.000Z",
        comment: "test",
      };
      const input2 = {
        timeSpent: "  2H ",
        startedAt: "2026-09-30T10:00:00.000Z",
        comment: "test",
      };
      expect(computeWorklogRequestHash(input1)).toBe(computeWorklogRequestHash(input2));
    });

    it("produces different hashes for different inputs", () => {
      const input1 = {
        timeSpent: "2h",
        startedAt: "2026-09-30T10:00:00.000Z",
      };
      const input2 = {
        timeSpent: "3h",
        startedAt: "2026-09-30T10:00:00.000Z",
      };
      expect(computeWorklogRequestHash(input1)).not.toBe(computeWorklogRequestHash(input2));
    });
  });

  describe("isSafeReturnUrl", () => {
    it("accepts valid relative internal URLs", () => {
      expect(isSafeReturnUrl("/stale")).toBe(true);
      expect(isSafeReturnUrl("/stale?view=my-work&tab=standardization")).toBe(true);
      expect(isSafeReturnUrl("/bulk?keys=EPM-123")).toBe(true);
    });

    it("rejects open-redirect attack vectors", () => {
      expect(isSafeReturnUrl("https://evil.com")).toBe(false);
      expect(isSafeReturnUrl("http://evil.com")).toBe(false);
      expect(isSafeReturnUrl("//evil.com")).toBe(false);
      expect(isSafeReturnUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeReturnUrl("")).toBe(false);
      expect(isSafeReturnUrl(null)).toBe(false);
    });
  });
});
