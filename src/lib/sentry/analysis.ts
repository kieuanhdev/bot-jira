// Root-cause analysis of a Sentry issue: the shape the host-side runner returns,
// its validation, the markdown block put into the Jira task, and the release →
// git tag mapping. Pure (no I/O) so the web and the tests share it.

export type AnalysisConfidence = "low" | "medium" | "high";

export type SentryAnalysisResult = {
  /** How the user/app got to the error: the flow in the code leading to the crash. Absent in older results. */
  flow?: string;
  /** Predicted steps to reproduce, from the code (not verified on a device). Absent in older results. */
  reproSteps?: string[];
  rootCause: string;
  /** Files/lines worth opening, e.g. `lib/foo.dart:42`. */
  files: string[];
  suggestedFix: string;
  confidence: AnalysisConfidence;
  /** The model's call on whether a small local code change fixes it (as opposed to needing a device, config or a library upgrade). */
  autoFixable?: boolean;
  /** Proposed fix as a unified diff, produced in a throwaway checkout and never applied to the repo. */
  patch?: string;
};

const MAX_TEXT = 4000;
const MAX_FILES = 12;
const MAX_STEPS = 12;
export const MAX_PATCH_LENGTH = 60_000;
/** A patch longer than this is linked ("xem trên web") instead of inlined in the Jira description. */
const MAX_PATCH_IN_TASK = 6_000;
const MAX_STEP_LEN = 300;
const MAX_FILE_LEN = 300;
const CONFIDENCES: readonly AnalysisConfidence[] = ["low", "medium", "high"];

export const ANALYSIS_HEADING = "## Nguyên nhân & hướng sửa (AI)";

function text(v: unknown, label: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`analysis ${label} missing`);
  return v.trim().slice(0, MAX_TEXT);
}

/** Validate the runner's JSON. Throws on a malformed object. */
export function parseAnalysisResult(obj: unknown): SentryAnalysisResult {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("analysis is not an object");
  const raw = obj as Record<string, unknown>;
  const files = Array.isArray(raw.files)
    ? raw.files
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim().slice(0, MAX_FILE_LEN))
        .slice(0, MAX_FILES)
    : [];
  const confidence = CONFIDENCES.find((c) => c === raw.confidence) ?? "low";
  const reproSteps = Array.isArray(raw.reproSteps)
    ? raw.reproSteps
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, MAX_STEP_LEN))
        .slice(0, MAX_STEPS)
    : [];
  const patch = typeof raw.patch === "string" && /^diff --git /.test(raw.patch.trimStart()) ? raw.patch : undefined;
  const flow = typeof raw.flow === "string" && raw.flow.trim() ? raw.flow.trim().slice(0, MAX_TEXT) : undefined;
  return {
    ...(flow ? { flow } : {}),
    ...(reproSteps.length > 0 ? { reproSteps } : {}),
    rootCause: text(raw.rootCause, "rootCause"),
    files,
    suggestedFix: text(raw.suggestedFix, "suggestedFix"),
    confidence,
    ...(typeof raw.autoFixable === "boolean" ? { autoFixable: raw.autoFixable } : {}),
    ...(patch && patch.length <= MAX_PATCH_LENGTH ? { patch } : {}),
  };
}

/** Narrow a stored `result` JSON column; null when it does not parse. */
export function readStoredResult(value: unknown): SentryAnalysisResult | null {
  try {
    return parseAnalysisResult(value);
  } catch {
    return null;
  }
}

const CONFIDENCE_LABEL: Record<AnalysisConfidence, string> = {
  low: "thấp",
  medium: "trung bình",
  high: "cao",
};

export function confidenceLabel(c: AnalysisConfidence): string {
  return CONFIDENCE_LABEL[c];
}

/** Markdown block for the Jira task description. */
export function formatAnalysisMarkdown(result: SentryAnalysisResult): string {
  const lines = [
    ANALYSIS_HEADING,
    `Độ tin cậy: ${confidenceLabel(result.confidence)}`,
    "",
  ];
  if (result.flow) lines.push("**Luồng dẫn đến lỗi**", result.flow, "");
  lines.push("**Nguyên nhân**", result.rootCause);
  if (result.reproSteps?.length) {
    lines.push("", "**Các bước tái hiện (dự đoán từ code, chưa kiểm chứng trên máy)**", ...result.reproSteps.map((x, i) => `${i + 1}. ${x}`));
  }
  if (result.files.length > 0) {
    lines.push("", "**File liên quan**", ...result.files.map((f) => `- ${f}`));
  }
  lines.push("", "**Hướng sửa**", result.suggestedFix);
  if (result.patch) {
    lines.push("", "**Bản vá đề xuất (AI tạo, chưa biên dịch/chạy thử, dev kiểm tra trước khi áp dụng)**");
    if (result.patch.length <= MAX_PATCH_IN_TASK) lines.push("```diff", result.patch.trimEnd(), "```");
    else lines.push("Bản vá dài, xem trên trang Sentry của web.");
  }
  return lines.join("\n");
}

/**
 * Put the analysis block in a task description: before "## Thông tin gốc" when the
 * description has that block, else at the end. An existing analysis block is
 * replaced, so re-applying never duplicates it.
 */
export function withAnalysisSection(description: string, result: SentryAnalysisResult): string {
  const block = formatAnalysisMarkdown(result);
  const own = new RegExp(`^${ANALYSIS_HEADING.replace(/[()&]/g, "\\$&")}[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m");
  const stripped = description.replace(own, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  const original = /^## Thông tin gốc/m.exec(stripped);
  if (!original) return stripped ? `${stripped}\n\n${block}` : block;
  const head = stripped.slice(0, original.index).trimEnd();
  const tail = stripped.slice(original.index);
  return `${head ? `${head}\n\n` : ""}${block}\n\n${tail}`;
}

/**
 * Git ref of the release a Sentry issue came from. Mobile releases look like
 * `vn.softdreams.easyhrm@4.10.2+124`; the tag is `v4.10.2`. Null when the
 * release carries no version, so the runner falls back to the default branch.
 */
export function releaseToGitTag(release: string | null | undefined): string | null {
  if (!release) return null;
  const m = /@v?(\d+(?:\.\d+){1,3})(?:[+-].*)?$/.exec(release.trim());
  return m ? `v${m[1]}` : null;
}
