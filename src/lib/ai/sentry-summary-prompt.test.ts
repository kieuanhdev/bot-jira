import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION_LENGTH, MAX_SUMMARY_LENGTH } from "@/lib/bulk/create-types";
import type { SentryEventDigest } from "@/lib/sentry/event-digest";
import type { SentryTaskSource } from "@/lib/sentry/task-draft";
import { buildSentrySummaryPrompt, parseSentrySummary } from "./sentry-summary-prompt";

const row: SentryTaskSource = {
  sentryIssueId: "4242",
  shortId: "WEB-1A",
  title: "TypeError: Cannot read properties of undefined (reading 'id')",
  permalinkUrl: "https://sentry.example.com/organizations/acme/issues/4242/",
  level: "error",
  eventCount: 128,
  firstSeen: "2026-10-01T00:00:00.000Z",
  lastSeen: "2026-10-16T08:30:00.000Z",
};

const digest: SentryEventDigest = {
  exceptionType: "TypeError",
  exceptionValue: "Cannot read properties of undefined (reading 'id')",
  culprit: "app/orders/checkout in submitOrder",
  frames: [
    { file: "src/orders/checkout.ts", fn: "submitOrder", line: 88 },
    { file: "src/orders/api.ts", fn: "postOrder", line: 12 },
  ],
  tags: { environment: "production", release: "web@1.4.2" },
  requestUrl: "https://shop.example.com/checkout",
};

const bareRow: SentryTaskSource = {
  sentryIssueId: "9001",
  shortId: null,
  title: null,
  permalinkUrl: null,
  level: null,
  eventCount: null,
  firstSeen: null,
  lastSeen: null,
};

describe("buildSentrySummaryPrompt", () => {
  it("includes the culprit and the first in-app frame when a digest is given", () => {
    const prompt = buildSentrySummaryPrompt(row, digest);
    expect(prompt).toContain("app/orders/checkout in submitOrder");
    expect(prompt).toContain("src/orders/checkout.ts");
    expect(prompt).toContain("submitOrder");
    expect(prompt).toContain("88");
    for (const section of ["Hiện tượng", "Vị trí trong code", "Ảnh hưởng", "Hướng điều tra"]) {
      expect(prompt).toContain(section);
    }
    expect(prompt).toMatch(/JSON/);
  });

  it("never prints undefined/null when the digest and optional fields are missing", () => {
    const prompt = buildSentrySummaryPrompt(bareRow, null);
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toMatch(/\bnull\b/);
    expect(prompt).toContain("9001");
  });
});

describe("parseSentrySummary", () => {
  it("adds the [Sentry] <shortId>: prefix when missing", () => {
    const out = parseSentrySummary({ summary: "Lỗi đặt hàng", description: "Mô tả" }, row);
    expect(out.summary).toBe("[Sentry] WEB-1A: Lỗi đặt hàng");
  });

  it("does not double the prefix and replaces a wrong id", () => {
    expect(
      parseSentrySummary({ summary: "[Sentry] WEB-1A: Lỗi đặt hàng", description: "x" }, row).summary
    ).toBe("[Sentry] WEB-1A: Lỗi đặt hàng");
    expect(
      parseSentrySummary({ summary: "[Sentry] OTHER-9: Lỗi đặt hàng", description: "x" }, row).summary
    ).toBe("[Sentry] WEB-1A: Lỗi đặt hàng");
  });

  it("falls back to the issue id when there is no shortId", () => {
    expect(parseSentrySummary({ summary: "Lỗi", description: "x" }, bareRow).summary).toBe(
      "[Sentry] 9001: Lỗi"
    );
  });

  it("keeps the summary to one line within the length limit", () => {
    const out = parseSentrySummary(
      { summary: `Dòng một\nDòng hai ${"a".repeat(400)}`, description: "x" },
      row
    );
    expect(out.summary).toBe("[Sentry] WEB-1A: Dòng một");
    const long = parseSentrySummary({ summary: "b".repeat(400), description: "x" }, row);
    expect(long.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
    expect(long.summary.startsWith("[Sentry] WEB-1A: ")).toBe(true);
  });

  it("always appends the original Sentry block with the permalink", () => {
    const out = parseSentrySummary({ summary: "Lỗi", description: "## Hiện tượng\nAbc" }, row);
    expect(out.description).toContain("## Hiện tượng\nAbc");
    expect(out.description).toContain("Thông tin gốc");
    expect(out.description).toContain(row.permalinkUrl);
    expect(out.description.indexOf("Abc")).toBeLessThan(out.description.indexOf("Thông tin gốc"));
  });

  it("keeps the permalink even when the AI description is huge", () => {
    const out = parseSentrySummary({ summary: "Lỗi", description: "x".repeat(40_000) }, row);
    expect(out.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(out.description).toContain(row.permalinkUrl);
  });

  it("returns a suggested priority and writes it into the description", () => {
    const out = parseSentrySummary(
      { summary: "Lỗi", description: "Mô tả", priorityName: " High " },
      row
    );
    expect(out.priorityName).toBe("High");
    expect(out.description).toContain("Priority đề xuất: High");
  });

  it("puts the suggested priority inside the Ảnh hưởng section", () => {
    const out = parseSentrySummary(
      {
        summary: "Lỗi",
        description: "## Hiện tượng\nA\n## Ảnh hưởng\nLevel error\n## Hướng điều tra\nB",
        priorityName: "High",
      },
      row
    );
    const impact = out.description.indexOf("## Ảnh hưởng");
    const line = out.description.indexOf("Priority đề xuất: High");
    const next = out.description.indexOf("## Hướng điều tra");
    expect(impact).toBeLessThan(line);
    expect(line).toBeLessThan(next);
  });

  it("ignores a non-string or empty priority", () => {
    expect(parseSentrySummary({ summary: "Lỗi", description: "x", priorityName: 3 }, row).priorityName)
      .toBeUndefined();
    expect(parseSentrySummary({ summary: "Lỗi", description: "x", priorityName: "  " }, row))
      .not.toHaveProperty("priorityName");
  });

  it("throws on a malformed object so generateJson retries", () => {
    expect(() => parseSentrySummary(null, row)).toThrow();
    expect(() => parseSentrySummary({ summary: "Lỗi" }, row)).toThrow();
    expect(() => parseSentrySummary({ summary: "   ", description: "x" }, row)).toThrow();
    expect(() => parseSentrySummary({ summary: "Lỗi", description: 5 }, row)).toThrow();
  });
});
