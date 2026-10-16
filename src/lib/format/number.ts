/**
 * Pure formatting helpers for numbers and percentages.
 * Client bundle safe: zero external dependencies, zero Node built-ins.
 */

export interface FormatNumberOptions {
  locale?: string;
  fallback?: string;
}

export interface FormatPercentOptions {
  digits?: number;
  locale?: string;
  isRatio?: boolean;
}

/**
 * Format a number using Vietnamese locale by default (e.g. 1.234).
 * Returns "0" or fallback for null/undefined/NaN.
 */
export function formatNumber(
  n: number | null | undefined,
  options?: FormatNumberOptions
): string {
  if (n == null || Number.isNaN(n)) return options?.fallback ?? "0";
  return n.toLocaleString(options?.locale ?? "vi-VN");
}

/**
 * Format a decimal fraction or percentage into a percent string (e.g. 0.85 -> "85%", 0.855 with digits=1 -> "85,5%").
 */
export function formatPercent(
  value: number | null | undefined,
  options?: FormatPercentOptions
): string {
  if (value == null || Number.isNaN(value)) return "0%";
  const digits = options?.digits ?? 0;
  const isRatio = options?.isRatio ?? (Math.abs(value) <= 1 && value !== 0);
  const ratio = isRatio ? value : value / 100;
  return new Intl.NumberFormat(options?.locale ?? "vi-VN", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}
