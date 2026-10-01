"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedControlItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
  disabled?: boolean;
};

type SegmentedTone = "primary" | "neutral";

export type SegmentedControlProps<T extends string> = {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Active-item style: `primary` (filled) or `neutral` (raised on muted track). */
  tone?: SegmentedTone;
  "aria-label"?: string;
  className?: string;
};

/**
 * A compact button-cluster used as a single-select filter / view switch. Uses
 * `aria-pressed` toggle semantics (not tabs, since there is no tabpanel). The
 * active style is uniform across items (a single `tone`); per-item category
 * color belongs to the domain, not here.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  tone = "primary",
  "aria-label": ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("inline-flex items-center gap-1 rounded-lg bg-muted/40 p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            aria-pressed={active}
            onClick={() => {
              if (!item.disabled) onChange(item.value);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? tone === "primary"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-background text-foreground shadow-xs"
                : "cursor-pointer text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            <span>{item.label}</span>
            {item.count != null && item.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                  active
                    ? tone === "primary"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-foreground/15 text-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
