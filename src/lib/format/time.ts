/**
 * Pure formatting helpers for time, relative time, and duration.
 * Client bundle safe: zero external dependencies, zero Node built-ins.
 */

export interface FormatRelativeOptions {
  locale?: "en" | "vi";
  empty?: string;
  now?: Date | number;
  thresholds?: {
    justNowSeconds?: number;
    showYesterday?: boolean;
    showWeeks?: boolean;
  };
}

export interface FormatDurationOptions {
  units?: "jira" | "hm";
  empty?: "0m" | "—" | null;
  includeSeconds?: boolean;
  maxUnit?: "w" | "d" | "h";
}

export interface FormatDateTimeOptions {
  locale?: string;
  year?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "narrow" | "short" | "long";
  day?: "numeric" | "2-digit";
  hour?: "numeric" | "2-digit";
  minute?: "numeric" | "2-digit";
  second?: "numeric" | "2-digit";
}

export interface FormatDateOptions {
  locale?: string;
  year?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "narrow" | "short" | "long";
  day?: "numeric" | "2-digit";
}

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 28800; // 8 hours in Jira working day
export const SECONDS_PER_WEEK = 144000; // 5 days in Jira working week

/**
 * Format date/time to a relative string ("just now", "5m ago", "5 phút trước", etc.)
 */
export function formatRelative(
  d: Date | string | number | null | undefined,
  options?: FormatRelativeOptions
): string {
  const empty = options?.empty ?? "—";
  if (d == null || d === "") return empty;

  const date = typeof d === "object" && d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return empty;

  const nowMs =
    options?.now instanceof Date
      ? options.now.getTime()
      : typeof options?.now === "number"
      ? options.now
      : Date.now();

  const diffMs = nowMs - date.getTime();
  const s = Math.floor(diffMs / 1000);
  const locale = options?.locale ?? "en";
  const showYesterday = options?.thresholds?.showYesterday ?? false;
  const showWeeks = options?.thresholds?.showWeeks ?? false;
  const justNowLimit = options?.thresholds?.justNowSeconds ?? 60;

  if (locale === "vi") {
    if (s < justNowLimit) return "Vừa xong";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    const days = Math.floor(h / 24);
    if (showYesterday && days === 1) return "Hôm qua";
    if (showWeeks && days < 7) return `${days} ngày trước`;
    if (showWeeks && days < 30) return `${Math.floor(days / 7)} tuần trước`;
    if (days < 30 && !showWeeks) return `${days} ngày trước`;
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // Default English (timeAgo behavior)
  if (s < justNowLimit) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/**
 * Standard English relative time helper.
 * [D10 is deferred pending approval, so English output is preserved].
 */
export function timeAgo(d: Date | string | null | undefined): string {
  return formatRelative(d, { locale: "en", empty: "—" });
}

/**
 * Vietnamese relative time helper for notifications.
 */
export function formatRelativeTimeVi(dateStr: string): string {
  return formatRelative(dateStr, {
    locale: "vi",
    empty: "—",
    thresholds: { showYesterday: true, showWeeks: true },
  });
}

/**
 * Format age in milliseconds to human readable Vietnamese duration (admin overview heartbeat).
 */
export function formatAge(ms: number | null | undefined, options?: { empty?: string }): string {
  if (ms == null) return options?.empty ?? "chưa có";
  const min = Math.round(ms / 60_000);
  return min < 1 ? "< 1 phút" : min < 60 ? `${min} phút` : `${Math.round(min / 60)} giờ`;
}

/**
 * Formats duration in seconds into standard representations ("1w 2d 3h", "1h 30m", etc.)
 */
export function formatDuration(
  totalSeconds: number | null | undefined,
  options?: FormatDurationOptions
): string | null {
  const empty = options?.empty !== undefined ? options.empty : "0m";

  if (totalSeconds == null || Number.isNaN(totalSeconds) || totalSeconds <= 0) {
    return empty;
  }

  const units = options?.units ?? "jira";
  const includeSeconds = options?.includeSeconds ?? false;
  const maxUnit = options?.maxUnit;

  if (units === "hm") {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return includeSeconds ? `${totalSeconds}s` : empty;
  }

  // Jira standard units: w (40h), d (8h), h, m
  let remaining = Math.round(totalSeconds);
  let weeks = 0;
  if (maxUnit !== "d" && maxUnit !== "h") {
    weeks = Math.floor(remaining / SECONDS_PER_WEEK);
    remaining %= SECONDS_PER_WEEK;
  }

  let days = 0;
  if (maxUnit !== "h") {
    days = Math.floor(remaining / SECONDS_PER_DAY);
    remaining %= SECONDS_PER_DAY;
  }

  const hours = Math.floor(remaining / SECONDS_PER_HOUR);
  remaining %= SECONDS_PER_HOUR;

  const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);
  const seconds = remaining % SECONDS_PER_MINUTE;

  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 && includeSeconds && seconds > 0) {
    parts.push(`${seconds}s`);
  }

  return parts.length > 0 ? parts.join(" ") : empty;
}

/**
 * Formats seconds to Jira string (5400 -> "1h 30m", 28800 -> "1d").
 */
export function formatJiraDuration(totalSeconds: number | null | undefined): string {
  return formatDuration(totalSeconds, { units: "jira", empty: "0m" }) ?? "0m";
}

/**
 * Formats seconds to Jira string (used in bulk utils, caps at 'd', returns "—" if <= 0).
 */
export function formatSecondsToJira(seconds: unknown): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds <= 0) return "—";
  return (
    formatDuration(seconds, {
      units: "jira",
      maxUnit: "d",
      empty: "—",
      includeSeconds: true,
    }) ?? "—"
  );
}

/**
 * Formats time spent in seconds (returns null if empty/zero, uses 'hm' units).
 */
export function formatTimeSpent(seconds: number | null | undefined): string | null {
  return formatDuration(seconds, {
    units: "hm",
    empty: null,
    includeSeconds: true,
  });
}

/**
 * Formats duration in milliseconds for stats and jobs (500 -> "500 ms", 5500 -> "5.5 s", 125000 -> "2m 5s").
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

/**
 * Standard date & time formatter with fallback dash.
 */
export function formatDateTime(
  d: Date | string | null | undefined,
  options?: FormatDateTimeOptions
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(options?.locale, {
    year: options?.year ?? "numeric",
    month: options?.month ?? "short",
    day: options?.day ?? "numeric",
    hour: options?.hour ?? "2-digit",
    minute: options?.minute ?? "2-digit",
    second: options?.second,
  });
}

/**
 * Standard date formatter with fallback dash.
 */
export function formatDate(
  d: Date | string | null | undefined,
  options?: FormatDateOptions
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(options?.locale, {
    year: options?.year ?? "numeric",
    month: options?.month ?? "short",
    day: options?.day ?? "numeric",
  });
}
