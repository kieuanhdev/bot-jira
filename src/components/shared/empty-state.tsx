import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  /** Decorative Lucide icon shown in a muted circle. */
  icon?: ComponentType<{ className?: string }>;
  /** Short title (kept to a line or two). */
  title: ReactNode;
  /** One-line hint or description. */
  hint?: ReactNode;
  description?: ReactNode;
  /** Optional action (e.g. a "clear filters" button or a link to settings). */
  action?: ReactNode;
  /** Visual density: "default" for full-page views, "compact" for dialogs and cards. */
  size?: "default" | "compact";
  className?: string;
};

/**
 * Shared empty / no-results / configuration-blocked state.
 *
 * Follows the design-system convention: icon in a muted circle, a short title,
 * a one-line hint, and an optional action. Use distinct copy to differentiate:
 * - dataset has no data yet;
 * - no results because of active filters;
 * - permission / configuration blocker (pair with an `action`).
 *
 * Presentational and server-compatible (no hooks, no client-only APIs).
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const isCompact = size === "compact";
  const bodyText = hint ?? description;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center",
        isCompact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted",
            isCompact ? "h-9 w-9" : "h-12 w-12"
          )}
        >
          <Icon
            className={cn(
              "text-muted-foreground",
              isCompact ? "h-4.5 w-4.5" : "h-6 w-6"
            )}
            aria-hidden="true"
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3
          className={cn(
            "font-semibold text-foreground",
            isCompact ? "text-sm" : "text-base"
          )}
        >
          {title}
        </h3>
        {bodyText ? (
          <p
            className={cn(
              "mx-auto text-muted-foreground",
              isCompact ? "max-w-xs text-2xs" : "max-w-sm text-xs"
            )}
          >
            {bodyText}
          </p>
        ) : null}
      </div>
      {action ? <div className={isCompact ? "mt-0.5" : "mt-1"}>{action}</div> : null}
    </div>
  );
}
