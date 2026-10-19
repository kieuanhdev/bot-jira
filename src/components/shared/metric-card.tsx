"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Semantic accent tone. Drives only the icon chip color; the selection indicator
 * is always a consistent `primary` ring so the "active filter" is unambiguous
 * regardless of category.
 */
export type MetricTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

const toneChip: Record<MetricTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary-soft-foreground",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-destructive/12 text-destructive",
};

export type MetricCardProps = {
  label: ReactNode;
  value: number | string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: MetricTone;
  /** Only meaningful when the card is interactive (has `onClick`). */
  selected?: boolean;
  /** When provided, the card is rendered as a clickable, keyboard-operable control. */
  onClick?: () => void;
  loading?: boolean;
  className?: string;
};

/**
 * A single KPI / summary tile. Read-only by default (no fake affordances); only
 * becomes a button (cursor, hover lift, focus ring, `aria-pressed`) when an
 * `onClick` is supplied. Uses semantic tokens only.
 */
export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "neutral",
  selected = false,
  onClick,
  loading = false,
  className,
}: MetricCardProps) {
  const interactive = typeof onClick === "function";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex h-full flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-primary bg-primary-soft ring-2 ring-primary" : "border-border",
        interactive && !selected && "hover:border-primary/40",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? (
          <span className={cn("shrink-0 rounded-lg p-1.5", toneChip[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-1">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</div>
        )}
        {description ? (
          <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
