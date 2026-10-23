import { describe, expect, it } from "vitest";
import {
  ANALYSIS_HEADING,
  formatAnalysisMarkdown,
  parseAnalysisResult,
  readStoredResult,
  releaseToGitTag,
  withAnalysisSection,
  type SentryAnalysisResult,
} from "./analysis";

const RESULT: SentryAnalysisResult = {
  rootCause: "camera_android không kiểm tra null cho pictureImageReader.",
  files: ["Camera.java:620"],
  suggestedFix: "Nâng camera_android hoặc chặn start stream khi controller đã dispose.",
  confidence: "medium",
};

describe("releaseToGitTag", () => {
  it("maps bundle@version+build to a v-tag", () => {
    expect(releaseToGitTag("vn.softdreams.easyhrm@4.10.2+124")).toBe("v4.10.2");
    expect(releaseToGitTag("vn.softdreams.easyhrm.dev@4.10.1+4")).toBe("v4.10.1");
    expect(releaseToGitTag("app@1.2.3")).toBe("v1.2.3");
  });
  it("is null without a version", () => {
    expect(releaseToGitTag(null)).toBeNull();
    expect(releaseToGitTag("")).toBeNull();
    expect(releaseToGitTag("3f2a9c1")).toBeNull();
  });
});

describe("parseAnalysisResult", () => {
  it("accepts a valid result and trims it", () => {
    expect(parseAnalysisResult({ ...RESULT, rootCause: "  x  " }).rootCause).toBe("x");
  });
  it("defaults an unknown confidence to low and drops non-string files", () => {
    const r = parseAnalysisResult({ ...RESULT, confidence: "certain", files: ["a.dart:1", 5, " "] });
    expect(r.confidence).toBe("low");
    expect(r.files).toEqual(["a.dart:1"]);
  });
  it("rejects missing rootCause or suggestedFix", () => {
    expect(() => parseAnalysisResult({ ...RESULT, rootCause: "" })).toThrow();
    expect(() => parseAnalysisResult({ ...RESULT, suggestedFix: undefined })).toThrow();
    expect(() => parseAnalysisResult(null)).toThrow();
  });
  it("readStoredResult returns null for junk", () => {
    expect(readStoredResult({ nope: true })).toBeNull();
  });
});

describe("flow and reproSteps", () => {
  it("keeps them when present and caps the steps", () => {
    const r = parseAnalysisResult({
      ...RESULT,
      flow: "  Mở màn A rồi quay lại  ",
      reproSteps: ["Mở A", " ", "Quay lại", 3],
    });
    expect(r.flow).toBe("Mở màn A rồi quay lại");
    expect(r.reproSteps).toEqual(["Mở A", "Quay lại"]);
  });
  it("stays valid without them (older results) and omits empty keys", () => {
    const r = parseAnalysisResult(RESULT);
    expect(r).not.toHaveProperty("flow");
    expect(r).not.toHaveProperty("reproSteps");
  });
  it("renders both in the task markdown", () => {
    const md = formatAnalysisMarkdown({ ...RESULT, flow: "A → B", reproSteps: ["Mở A", "Quay lại"] });
    expect(md).toContain("**Luồng dẫn đến lỗi**\nA → B");
    expect(md).toContain("1. Mở A\n2. Quay lại");
    expect(md.indexOf("Luồng dẫn đến lỗi")).toBeLessThan(md.indexOf("**Nguyên nhân**"));
  });
});

describe("autoFixable and patch", () => {
  const PATCH = "diff --git a/lib/a.dart b/lib/a.dart\n--- a/lib/a.dart\n+++ b/lib/a.dart\n@@ -1 +1 @@\n-old\n+new\n";
  it("keeps a real diff and the flag", () => {
    const r = parseAnalysisResult({ ...RESULT, autoFixable: true, patch: PATCH });
    expect(r.autoFixable).toBe(true);
    expect(r.patch).toBe(PATCH);
  });
  it("drops text that is not a git diff", () => {
    expect(parseAnalysisResult({ ...RESULT, patch: "just prose" })).not.toHaveProperty("patch");
  });
  it("inlines a short patch in the task and links a long one", () => {
    expect(formatAnalysisMarkdown({ ...RESULT, patch: PATCH })).toContain("```diff");
    const long = `${PATCH}${"+x\n".repeat(4000)}`;
    const md = formatAnalysisMarkdown({ ...RESULT, patch: long });
    expect(md).not.toContain("```diff");
    expect(md).toContain("xem trên trang Sentry");
  });
});

describe("withAnalysisSection", () => {
  it("puts the block before 'Thông tin gốc'", () => {
    const out = withAnalysisSection("## Hiện tượng\nA\n\n## Thông tin gốc\nSentry issue: x", RESULT);
    expect(out.indexOf(ANALYSIS_HEADING)).toBeGreaterThan(out.indexOf("## Hiện tượng"));
    expect(out.indexOf(ANALYSIS_HEADING)).toBeLessThan(out.indexOf("## Thông tin gốc"));
  });
  it("appends when there is no original block", () => {
    const out = withAnalysisSection("Auto-created from Sentry.", RESULT);
    expect(out.startsWith("Auto-created from Sentry.")).toBe(true);
    expect(out).toContain(formatAnalysisMarkdown(RESULT));
  });
  it("is idempotent: re-applying replaces the old block", () => {
    const once = withAnalysisSection("## Hiện tượng\nA\n\n## Thông tin gốc\nB", RESULT);
    const twice = withAnalysisSection(once, { ...RESULT, rootCause: "khác" });
    expect(twice.split(ANALYSIS_HEADING).length).toBe(2);
    expect(twice).toContain("khác");
    expect(twice).not.toContain(RESULT.rootCause);
    expect(twice).toContain("## Thông tin gốc\nB");
  });
});
