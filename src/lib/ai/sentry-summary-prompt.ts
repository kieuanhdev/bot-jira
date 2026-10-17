// Prompt + parser for "AI tóm tắt lỗi" in the Sentry task form. The model
// rewrites the generated Sentry draft into a readable Vietnamese task; the
// original Sentry block (with the permalink) is always re-appended here, never
// left to the model.

import { MAX_DESCRIPTION_LENGTH, MAX_SUMMARY_LENGTH } from "@/lib/bulk/create-types";
import type { SentryEventDigest } from "@/lib/sentry/event-digest";
import { buildSentryTaskDraft, type SentryTaskSource } from "@/lib/sentry/task-draft";

export type SentrySummary = { summary: string; description: string; priorityName?: string };

const ORIGINAL_HEADING = "## Thông tin gốc";
const ANY_SENTRY_PREFIX = /^\s*\[sentry\]\s*[^:]*:\s*/i;

function ref(row: SentryTaskSource): string {
  return row.shortId ?? row.sentryIssueId;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `label: value` only when the value is present, so the prompt never shows "undefined"/"null". */
function line(label: string, value: string | number | null | undefined): string[] {
  if (value === null || value === undefined || value === "") return [];
  return [`- ${label}: ${value}`];
}

function issueFacts(row: SentryTaskSource): string[] {
  return [
    `- Mã issue: ${ref(row)}`,
    ...line("Tiêu đề", row.title),
    ...line("Level", row.level),
    ...line("Số lần xảy ra", row.eventCount),
    ...line("Lần đầu", iso(row.firstSeen)),
    ...line("Lần cuối", iso(row.lastSeen)),
  ];
}

function eventFacts(digest: SentryEventDigest): string[] {
  const out = [
    ...line("Exception", digest.exceptionType),
    ...line("Thông điệp lỗi", digest.exceptionValue),
    ...line("Culprit", digest.culprit),
    ...line("Request URL", digest.requestUrl),
  ];
  const tags = Object.entries(digest.tags);
  if (tags.length > 0) out.push(`- Tags: ${tags.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (digest.frames.length > 0) {
    out.push("- Stacktrace (frame trong code của app, frame lỗi trước):");
    for (const f of digest.frames) {
      out.push(`  - ${f.fn} (${f.file}${f.line !== undefined ? `:${f.line}` : ""})`);
    }
  }
  return out;
}

export function buildSentrySummaryPrompt(
  row: SentryTaskSource,
  digest: SentryEventDigest | null
): string {
  const facts = digest ? eventFacts(digest) : [];
  return [
    "Bạn là kỹ sư phần mềm, viết task Jira để đội dev xử lý một lỗi được Sentry ghi nhận.",
    "",
    "Thông tin issue Sentry:",
    ...issueFacts(row),
    "",
    facts.length > 0
      ? ["Chi tiết event mới nhất:", ...facts].join("\n")
      : "Không có chi tiết event/stacktrace; chỉ dựa vào thông tin issue ở trên, không bịa thêm vị trí code.",
    "",
    "Yêu cầu:",
    "- Viết bằng tiếng Việt, ngắn gọn, chính xác; giữ nguyên tên hàm, file, exception.",
    '- "summary": một dòng, tối đa 200 ký tự, mô tả ngắn lỗi. Không cần tiền tố [Sentry].',
    '- "description": Markdown với đúng 4 mục theo thứ tự:',
    "  ## Hiện tượng",
    "  ## Vị trí trong code",
    "  ## Ảnh hưởng (nêu level, số lần xảy ra, lần cuối)",
    "  ## Hướng điều tra",
    "  Không chép lại link Sentry hay khối thông tin gốc; hệ thống sẽ tự thêm.",
    '- "priorityName": một trong Highest, High, Medium, Low, Lowest theo mức ảnh hưởng.',
    "",
    "Chỉ trả về MỘT object JSON hợp lệ, không markdown bao ngoài, không giải thích:",
    '{"summary": "...", "description": "...", "priorityName": "..."}',
  ].join("\n");
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Validate the model's JSON for one row. Throws on a malformed object so
 * `generateJson` retries.
 *
 * - `summary`: first line only, any `[Sentry] …:` prefix replaced with this
 *   row's, trimmed to `MAX_SUMMARY_LENGTH` (the AI text is cut, not the prefix).
 * - `description`: AI body (+ suggested priority line), then "Thông tin gốc" with
 *   `buildSentryTaskDraft(row).description`. The AI body is cut so the original
 *   block, including the permalink, always fits in `MAX_DESCRIPTION_LENGTH`.
 */
export function parseSentrySummary(obj: unknown, row: SentryTaskSource): SentrySummary {
  if (!obj || typeof obj !== "object") throw new Error("AI summary is not an object");
  const raw = obj as Record<string, unknown>;

  const rawSummary = nonEmptyString(raw.summary);
  if (!rawSummary) throw new Error("AI summary missing");
  if (typeof raw.description !== "string") throw new Error("AI description missing");

  const prefix = `[Sentry] ${ref(row)}: `;
  const text = rawSummary.split(/\r?\n/, 1)[0].replace(ANY_SENTRY_PREFIX, "").trim();
  if (!text) throw new Error("AI summary empty");
  const summary = prefix + text.slice(0, MAX_SUMMARY_LENGTH - prefix.length).trim();

  const priorityName = nonEmptyString(raw.priorityName) ?? undefined;
  const bodyParts = [raw.description.trim()];
  if (priorityName) bodyParts.push(`Priority đề xuất: ${priorityName}`);
  const original = `\n\n${ORIGINAL_HEADING}\n${buildSentryTaskDraft(row).description}`;
  const body = bodyParts
    .filter(Boolean)
    .join("\n\n")
    .slice(0, Math.max(0, MAX_DESCRIPTION_LENGTH - original.length))
    .trimEnd();
  const description = (body + original).trimStart();

  return priorityName ? { summary, description, priorityName } : { summary, description };
}
