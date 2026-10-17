// Heuristic triage for the Sentry review queue. Sentry also carries telemetry
// (info-level breadcrumbs, feature-toggle logs) and expected client-side
// failures, so not every issue deserves a Jira Bug. This only *suggests* — the
// admin still decides.

export type TriageTier = "critical" | "normal" | "noise";

export type Triage = { tier: TriageTier; reason: string | null };

type Input = { level: string | null; title: string | null };

const NOISE_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.summary:\s*(success|fail)/i, reason: "Log telemetry, không phải exception" },
  { pattern: /^\[[\w.]+\]\s.*(Toggle|Adoption)/i, reason: "Log theo dõi tính năng" },
  { pattern: /Exception:\s*test\b/i, reason: "Issue thử nghiệm" },
  { pattern: /LocationServiceDisabled|kCLErrorDomain error 1\b/i, reason: "Người dùng tắt/từ chối định vị" },
  { pattern: /No space left on device|errno = 28/i, reason: "Thiết bị hết bộ nhớ" },
  { pattern: /request cancelled|manually cancelled/i, reason: "Request bị huỷ chủ động" },
  { pattern: /Play Store app is either not installed/i, reason: "Thiết bị thiếu Play Store chính thức" },
  { pattern: /ERROR_ALREADY_REQUESTING_PERMISSIONS/i, reason: "Xin quyền trùng lặp, tự hết" },
  { pattern: /status code of 401|INVALID_SESSION/i, reason: "Phiên hết hạn, hành vi bình thường" },
];

export function triageIssue({ level, title }: Input): Triage {
  const text = title ?? "";
  const rule = NOISE_RULES.find((r) => r.pattern.test(text));
  if (rule) return { tier: "noise", reason: rule.reason };
  if (level === "info" || level === "debug") return { tier: "noise", reason: "Mức info, không phải lỗi" };
  if (level === "fatal" || level === "error") return { tier: "critical", reason: null };
  return { tier: "normal", reason: null };
}

const TIER_ORDER: Record<TriageTier, number> = { critical: 0, normal: 1, noise: 2 };

/** Real problems first, then by volume, keeping the incoming (recency) order on ties. */
export function compareTriage(a: Input & { eventCount: number | null }, b: Input & { eventCount: number | null }) {
  const byTier = TIER_ORDER[triageIssue(a).tier] - TIER_ORDER[triageIssue(b).tier];
  if (byTier !== 0) return byTier;
  return (b.eventCount ?? 0) - (a.eventCount ?? 0);
}
