import { z } from "zod";
import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  SECONDS_PER_WEEK,
} from "@/lib/format/time";

export type CreateWorklogInput = {
  timeSpent: string;
  startedAt: string; // ISO-8601 with timezone
  comment?: string;
  adjustEstimate?: "leave";
  idempotencyKey: string;
};

export type CreateWorklogResult = {
  jiraKey: string;
  jiraWorklogId: string | null;
  timeSpentSeconds: number | null;
  cacheSynced: boolean;
  duplicate: boolean;
};

export type WorklogErrorCode =
  | "INVALID_DURATION"
  | "INVALID_STARTED_AT"
  | "FUTURE_STARTED_AT"
  | "COMMENT_TOO_LONG"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_ADJUST_ESTIMATE"
  | "JIRA_CREDENTIALS_REQUIRED"
  | "WORKLOG_FORBIDDEN"
  | "DUPLICATE_REQUEST"
  | "OUTCOME_UNKNOWN"
  | "JIRA_UNAVAILABLE"
  | "BAD_REQUEST";

export const MAX_WORKLOG_COMMENT_LENGTH = 4000;
export const JIRA_DURATION_RE = /^(?=.*\d)(?:\d+\s*[wdhm]\s*)+$/i;

// Clock drift tolerance: up to 5 minutes into the future
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Parses a Jira duration string (e.g. "30m", "2h", "1d 4h", "1w 2d") into seconds.
 * Returns null if the string is invalid or sums to 0 or less.
 */
export function parseJiraDuration(durationStr: string | null | undefined): number | null {
  if (!durationStr || typeof durationStr !== "string") return null;
  const trimmed = durationStr.trim();
  if (!JIRA_DURATION_RE.test(trimmed)) return null;

  const matches = trimmed.matchAll(/(\d+)\s*([wdhm])/gi);
  let totalSeconds = 0;

  for (const match of matches) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (isNaN(value) || value < 0) return null;

    switch (unit) {
      case "w":
        totalSeconds += value * SECONDS_PER_WEEK;
        break;
      case "d":
        totalSeconds += value * SECONDS_PER_DAY;
        break;
      case "h":
        totalSeconds += value * SECONDS_PER_HOUR;
        break;
      case "m":
        totalSeconds += value * SECONDS_PER_MINUTE;
        break;
      default:
        return null;
    }
  }

  return totalSeconds > 0 ? totalSeconds : null;
}

export { formatJiraDuration } from "@/lib/format/time";

/**
 * Formats an ISO datetime string into the exact format Jira REST API expects:
 * YYYY-MM-DDTHH:mm:ss.SSS+ZZZZ (e.g. 2026-09-30T09:15:00.000+0700).
 * Preserves the user's timezone offset if present.
 */
export function formatJiraStartedAt(input: string | Date): string {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new Error("Invalid date object provided to formatJiraStartedAt");
    }
    // Date object doesn't carry arbitrary offset in JS, format in UTC
    const iso = input.toISOString(); // e.g. 2026-09-30T02:15:00.000Z
    return iso.replace("Z", "+0000");
  }

  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Invalid startedAt string provided to formatJiraStartedAt");
  }

  const s = input.trim();

  // If simple date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T09:00:00.000+0000`;
  }

  // Regex to extract date, time, millis, and timezone offset
  // Examples:
  // 2026-09-30T09:15:00+07:00
  // 2026-09-30T09:15:00.000+0700
  // 2026-09-30T09:15:00Z
  // 2026-09-30 09:15:00
  const match = s.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,3}))?(?:(Z)|([+-]\d{2})(?::?(\d{2}))?)?$/i
  );

  if (!match) {
    // Fall back to Date parsing
    const d = new Date(s);
    if (isNaN(d.getTime())) {
      throw new Error(`Cannot parse startedAt date: ${s}`);
    }
    return d.toISOString().replace("Z", "+0000");
  }

  const datePart = match[1];
  let timePart = match[2];
  if (timePart.length === 5) {
    timePart = `${timePart}:00`;
  }
  const millis = (match[3] ?? "000").padEnd(3, "0").slice(0, 3);
  let tzPart = "+0000";

  if (match[4] && match[4].toUpperCase() === "Z") {
    tzPart = "+0000";
  } else if (match[5]) {
    const tzHours = match[5];
    const tzMins = match[6] ?? "00";
    tzPart = `${tzHours}${tzMins}`;
  }

  return `${datePart}T${timePart}.${millis}${tzPart}`;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: WorklogErrorCode };

function worklogIssue(ctx: z.RefinementCtx, code: WorklogErrorCode, message: string): void {
  ctx.addIssue({ code: "custom", message, params: { worklogCode: code } });
}

/**
 * Business and security rules for the create-worklog payload. Checks run in a
 * fixed order and stop at the first failure so the error code stays stable.
 */
export const CreateWorklogSchema = z
  .unknown()
  .superRefine((raw, ctx) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      worklogIssue(ctx, "BAD_REQUEST", "Dữ liệu yêu cầu không hợp lệ (cần là JSON object)");
      return;
    }
    const body = raw as Record<string, unknown>;

    // 1. timeSpent
    if (typeof body.timeSpent !== "string" || !body.timeSpent.trim()) {
      worklogIssue(
        ctx,
        "INVALID_DURATION",
        "Thời lượng (timeSpent) là bắt buộc. Ví dụ: 30m, 2h, 1d 4h."
      );
      return;
    }
    const parsedSeconds = parseJiraDuration(body.timeSpent);
    if (!parsedSeconds || parsedSeconds <= 0) {
      worklogIssue(
        ctx,
        "INVALID_DURATION",
        "Thời lượng không hợp lệ. Vui lòng nhập đúng định dạng Jira (ví dụ: 30m, 2h, 1d 4h)."
      );
      return;
    }

    // 2. startedAt
    if (typeof body.startedAt !== "string" || !body.startedAt.trim()) {
      worklogIssue(ctx, "INVALID_STARTED_AT", "Thời điểm bắt đầu (startedAt) là bắt buộc.");
      return;
    }
    const startedDate = new Date(body.startedAt.trim());
    if (isNaN(startedDate.getTime())) {
      worklogIssue(
        ctx,
        "INVALID_STARTED_AT",
        "Thời điểm bắt đầu không hợp lệ (cần định dạng ISO-8601)."
      );
      return;
    }
    if (startedDate.getTime() - Date.now() > FUTURE_TOLERANCE_MS) {
      worklogIssue(
        ctx,
        "FUTURE_STARTED_AT",
        "Thời điểm bắt đầu không được lớn hơn thời điểm hiện tại quá 5 phút."
      );
      return;
    }

    // 3. comment (optional)
    if (body.comment !== undefined && body.comment !== null) {
      if (typeof body.comment !== "string") {
        worklogIssue(ctx, "BAD_REQUEST", "Ghi chú (comment) phải là chuỗi ký tự.");
        return;
      }
      if (body.comment.length > MAX_WORKLOG_COMMENT_LENGTH) {
        worklogIssue(
          ctx,
          "COMMENT_TOO_LONG",
          `Ghi chú quá dài (tối đa ${MAX_WORKLOG_COMMENT_LENGTH} ký tự).`
        );
        return;
      }
    }

    // 4. adjustEstimate (MVP only allows "leave" or undefined)
    if (body.adjustEstimate !== undefined && body.adjustEstimate !== "leave") {
      worklogIssue(
        ctx,
        "INVALID_ADJUST_ESTIMATE",
        "MVP chỉ hỗ trợ adjustEstimate='leave' để giữ nguyên Remaining Estimate."
      );
      return;
    }

    // 5. idempotencyKey
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) {
      worklogIssue(
        ctx,
        "INVALID_IDEMPOTENCY_KEY",
        "idempotencyKey là bắt buộc để đảm bảo an toàn ghi nhận."
      );
    }
  })
  .transform((raw): CreateWorklogInput => {
    const body = raw as Record<string, string | null | undefined>;
    const cleanComment = body.comment?.trim();
    return {
      timeSpent: body.timeSpent!.trim(),
      startedAt: body.startedAt!.trim(),
      ...(cleanComment ? { comment: cleanComment } : {}),
      adjustEstimate: "leave",
      idempotencyKey: body.idempotencyKey!.trim(),
    };
  });

/**
 * Validates the CreateWorklogInput payload against all business and security rules.
 */
export function validateCreateWorklogInput(raw: unknown): ValidationResult<CreateWorklogInput> {
  const result = CreateWorklogSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  const issue = result.error.issues[0];
  const params = (issue as { params?: { worklogCode?: WorklogErrorCode } }).params;
  return {
    success: false,
    error: issue.message,
    code: params?.worklogCode ?? "BAD_REQUEST",
  };
}

/**
 * Safely validates an internal redirect path against open-redirect vulnerabilities.
 * Must begin with a single slash, not double slash or protocol schema.
 */
export function isSafeReturnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;
  return true;
}

/** `YYYY-MM-DDTHH:mm` in local time — the value a `datetime-local` input needs. */
export function getDefaultLogStartedAt(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function validateWorklog(
  timeSpent: string,
  startedAt: string,
  nowMs: number = Date.now()
): { error?: string; parsedSeconds?: number; startedDate?: Date } {
  const trimmed = timeSpent.trim();
  const parsed = parseJiraDuration(trimmed);
  if (!parsed || parsed <= 0) {
    return {
      error: "Thời lượng không hợp lệ. Vui lòng nhập đúng cú pháp Jira (ví dụ: 30m, 2h, 1d 4h).",
    };
  }

  if (!startedAt) {
    return { error: "Thời điểm bắt đầu là bắt buộc." };
  }

  const startedDate = new Date(startedAt);
  if (isNaN(startedDate.getTime())) {
    return { error: "Thời điểm bắt đầu không hợp lệ." };
  }

  if (startedDate.getTime() - nowMs > 5 * 60 * 1000) {
    return {
      error: "Thời điểm bắt đầu không được lớn hơn hiện tại quá 5 phút.",
    };
  }

  return { parsedSeconds: parsed, startedDate };
}
