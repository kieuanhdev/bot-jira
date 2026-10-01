import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  /** Decorative Lucide icon shown in a muted circle. */
  icon: ComponentType<{ className?: string }>;
  /** Short title (kept to a line or two). */
  title: ReactNode;
  /** One-line hint. */
  hint?: ReactNode;
  /** Optional action (e.g. a "clear filters" button or a link to settings). */
  action?: ReactNode;
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
export function EmptyState({ icon: Icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <p className="mx-auto max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
