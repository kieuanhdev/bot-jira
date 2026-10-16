/**
 * Canonical health indicators, themes, and badge/card styling.
 * Client bundle safe: zero external dependencies, zero Prisma, zero Node built-ins.
 *
 * NOTE [D13]: Labels diverge between consumer views by design pending decision D13 approval.
 * - Table: "Ổn định" (healthy), "Hoàn thành" (completed)
 * - Summary: "Đúng tiến độ" (healthy), "Hoàn thành" (completed)
 * - Portfolio: "Đúng tiến độ" (healthy), "Đã hoàn thành" (completed)
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Trophy,
} from "lucide-react";
import type { HealthStatus } from "./types";

export type HealthBadgeVariant = "success" | "warning" | "danger" | "info" | "secondary";

export interface HealthConfigItem {
  label: string;
  variant: HealthBadgeVariant;
  icon: LucideIcon;
}

export interface HealthThemeItem extends HealthConfigItem {
  cardBorder: string;
  cardBg: string;
}

export interface PortfolioHealthConfigItem {
  id: HealthStatus;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  badgeVariant: HealthBadgeVariant;
  ring: string;
}

/** Config used by project-report-table.tsx */
export const HEALTH_CONFIG: Record<HealthStatus, HealthConfigItem> = {
  at_risk: { label: "Rủi ro cao", variant: "danger", icon: AlertOctagon },
  attention: { label: "Cần chú ý", variant: "warning", icon: AlertTriangle },
  healthy: { label: "Ổn định", variant: "success", icon: CheckCircle2 },
  completed: { label: "Hoàn thành", variant: "info", icon: Trophy },
  unknown: { label: "Chưa đủ dữ liệu", variant: "secondary", icon: HelpCircle },
};

/** Theme styling used by project-health-summary.tsx */
export const HEALTH_THEME: Record<HealthStatus, HealthThemeItem> = {
  at_risk: {
    label: "Rủi ro cao",
    variant: "danger",
    icon: AlertOctagon,
    cardBorder: "border-red-500/30",
    cardBg: "bg-red-500/5",
  },
  attention: {
    label: "Cần chú ý",
    variant: "warning",
    icon: AlertTriangle,
    cardBorder: "border-amber-500/30",
    cardBg: "bg-amber-500/5",
  },
  healthy: {
    label: "Đúng tiến độ",
    variant: "success",
    icon: CheckCircle2,
    cardBorder: "border-emerald-500/30",
    cardBg: "bg-emerald-500/5",
  },
  completed: {
    label: "Hoàn thành",
    variant: "info",
    icon: Trophy,
    cardBorder: "border-teal-500/30",
    cardBg: "bg-teal-500/5",
  },
  unknown: {
    label: "Chưa đủ dữ liệu",
    variant: "secondary",
    icon: HelpCircle,
    cardBorder: "border-border",
    cardBg: "bg-muted/20",
  },
};

/** Style and ring mapping used by portfolio-summary.tsx */
export const PORTFOLIO_HEALTH_CONFIG: Record<
  "at_risk" | "attention" | "healthy" | "completed",
  PortfolioHealthConfigItem
> = {
  at_risk: {
    id: "at_risk",
    label: "Rủi ro cao",
    icon: AlertOctagon,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    badgeVariant: "danger",
    ring: "ring-2 ring-red-500",
  },
  attention: {
    id: "attention",
    label: "Cần chú ý",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    badgeVariant: "warning",
    ring: "ring-2 ring-amber-500",
  },
  healthy: {
    id: "healthy",
    label: "Đúng tiến độ",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    badgeVariant: "success",
    ring: "ring-2 ring-emerald-500",
  },
  completed: {
    id: "completed",
    label: "Đã hoàn thành",
    icon: Trophy,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10",
    badgeVariant: "info",
    ring: "ring-2 ring-teal-500",
  },
};

export function getHealthTheme(status?: HealthStatus | null): HealthThemeItem {
  if (!status) return HEALTH_THEME.unknown;
  return HEALTH_THEME[status] ?? HEALTH_THEME.unknown;
}

export function getHealthConfig(status?: HealthStatus | null): HealthConfigItem {
  if (!status) return HEALTH_CONFIG.unknown;
  return HEALTH_CONFIG[status] ?? HEALTH_CONFIG.unknown;
}
