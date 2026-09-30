import { createHash } from "crypto";

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

// Standard Jira defaults: 1 day = 8h, 1 week = 5 days (40h)
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 8 * SECONDS_PER_HOUR;
const SECONDS_PER_WEEK = 5 * SECONDS_PER_DAY;

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

/**
 * Formats a duration in seconds into a standard Jira duration string.
 * Example: 5400 -> "1h 30m", 28800 -> "1d"
 */
export function formatJiraDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return "0m";

  let remaining = Math.round(totalSeconds);
  const weeks = Math.floor(remaining / SECONDS_PER_WEEK);
  remaining %= SECONDS_PER_WEEK;

  const days = Math.floor(remaining / SECONDS_PER_DAY);
  remaining %= SECONDS_PER_DAY;

  const hours = Math.floor(remaining / SECONDS_PER_HOUR);
  remaining %= SECONDS_PER_HOUR;

  const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);

  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "0m";
}

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

/**
 * Validates the CreateWorklogInput payload against all business and security rules.
 */
export function validateCreateWorklogInput(raw: unknown): ValidationResult<CreateWorklogInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      success: false,
      error: "Dữ liệu yêu cầu không hợp lệ (cần là JSON object)",
      code: "BAD_REQUEST",
    };
  }

  const body = raw as Record<string, unknown>;

  // 1. timeSpent
  if (typeof body.timeSpent !== "string" || !body.timeSpent.trim()) {
    return {
      success: false,
      error: "Thời lượng (timeSpent) là bắt buộc. Ví dụ: 30m, 2h, 1d 4h.",
      code: "INVALID_DURATION",
    };
  }

  const parsedSeconds = parseJiraDuration(body.timeSpent);
  if (!parsedSeconds || parsedSeconds <= 0) {
    return {
      success: false,
      error: "Thời lượng không hợp lệ. Vui lòng nhập đúng định dạng Jira (ví dụ: 30m, 2h, 1d 4h).",
      code: "INVALID_DURATION",
    };
  }

  // 2. startedAt
  if (typeof body.startedAt !== "string" || !body.startedAt.trim()) {
    return {
      success: false,
      error: "Thời điểm bắt đầu (startedAt) là bắt buộc.",
      code: "INVALID_STARTED_AT",
    };
  }

  const startedDate = new Date(body.startedAt.trim());
  if (isNaN(startedDate.getTime())) {
    return {
      success: false,
      error: "Thời điểm bắt đầu không hợp lệ (cần định dạng ISO-8601).",
      code: "INVALID_STARTED_AT",
    };
  }

  const now = Date.now();
  if (startedDate.getTime() - now > FUTURE_TOLERANCE_MS) {
    return {
      success: false,
      error: "Thời điểm bắt đầu không được lớn hơn thời điểm hiện tại quá 5 phút.",
      code: "FUTURE_STARTED_AT",
    };
  }

  // 3. comment (optional)
  let cleanComment: string | undefined = undefined;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== "string") {
      return {
        success: false,
        error: "Ghi chú (comment) phải là chuỗi ký tự.",
        code: "BAD_REQUEST",
      };
    }
    if (body.comment.length > MAX_WORKLOG_COMMENT_LENGTH) {
      return {
        success: false,
        error: `Ghi chú quá dài (tối đa ${MAX_WORKLOG_COMMENT_LENGTH} ký tự).`,
        code: "COMMENT_TOO_LONG",
      };
    }
    if (body.comment.trim()) {
      cleanComment = body.comment.trim();
    }
  }

  // 4. adjustEstimate (MVP only allows "leave" or undefined)
  if (body.adjustEstimate !== undefined && body.adjustEstimate !== "leave") {
    return {
      success: false,
      error: "MVP chỉ hỗ trợ adjustEstimate='leave' để giữ nguyên Remaining Estimate.",
      code: "INVALID_ADJUST_ESTIMATE",
    };
  }

  // 5. idempotencyKey
  if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) {
    return {
      success: false,
      error: "idempotencyKey là bắt buộc để đảm bảo an toàn ghi nhận.",
      code: "INVALID_IDEMPOTENCY_KEY",
    };
  }

  return {
    success: true,
    data: {
      timeSpent: body.timeSpent.trim(),
      startedAt: body.startedAt.trim(),
      ...(cleanComment ? { comment: cleanComment } : {}),
      adjustEstimate: "leave",
      idempotencyKey: body.idempotencyKey.trim(),
    },
  };
}

/**
 * Computes a deterministic SHA-256 hash of the normalized request parameters.
 * Used to verify whether duplicate idempotency keys have identical payloads.
 */
export function computeWorklogRequestHash(input: {
  timeSpent: string;
  startedAt: string;
  comment?: string;
  adjustEstimate?: string;
}): string {
  const normalized = JSON.stringify({
    timeSpent: input.timeSpent.trim().toLowerCase(),
    startedAt: new Date(input.startedAt).toISOString(),
    comment: (input.comment ?? "").trim(),
    adjustEstimate: input.adjustEstimate ?? "leave",
  });
  return createHash("sha256").update(normalized).digest("hex");
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
