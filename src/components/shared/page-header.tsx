import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  /** Small uppercase label rendered above the title (optional). */
  eyebrow?: ReactNode;
  /** Decorative Lucide icon, shown in a muted circle next to the title. */
  icon?: ComponentType<{ className?: string }>;
  /** The page's single `h1`. */
  title: ReactNode;
  /** Inline muted hint rendered right after the title (e.g. "• synced 5m ago"). */
  meta?: ReactNode;
  /** Short supporting line under the title. */
  description?: ReactNode;
  /** Optional badge/pill shown inline after the title. */
  badge?: ReactNode;
  /** Primary actions for the page; wrap on small screens. The page owns the actual controls. */
  actions?: ReactNode;
  /** Optional block rendered under the title/description, separated by a top border. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Shared page header. Manages responsive layout, typography, and icon treatment;
 * the concrete actions are provided by the page via `actions`.
 *
 * - Exactly one `h1`, semantically correct.
 * - Decorative icon is `aria-hidden`.
 * - Actions wrap on mobile.
 * - No per-page color hardcoding; uses semantic tokens only.
 *
 * Presentational and server-compatible (no hooks, no client-only APIs).
 */
export function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  meta,
  description,
  badge,
  actions,
  footer,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {eyebrow ? (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {Icon ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {badge}
            {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
          </div>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {footer ? <div className="border-t border-border pt-3">{footer}</div> : null}
    </header>
  );
}
