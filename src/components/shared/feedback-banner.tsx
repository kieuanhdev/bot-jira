import type { ComponentType, ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackTone = "info" | "success" | "warning" | "destructive";

const TONE: Record<FeedbackTone, { box: string; icon: string; Icon: ComponentType<{ className?: string }> }> = {
  info: { box: "border-primary/30 bg-primary/10", icon: "text-primary", Icon: Info },
  success: {
    box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
    Icon: CircleAlert,
  },
  destructive: { box: "border-destructive/30 bg-destructive/10 text-destructive", icon: "text-destructive", Icon: TriangleAlert },
};

export type FeedbackBannerProps = {
  tone: FeedbackTone;
  /** Decorative icon; defaults to a tone-appropriate Lucide icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Message body. */
  children: ReactNode;
  /** Optional action aligned to the trailing edge (e.g. a "refresh" button). */
  action?: ReactNode;
  /** ARIA role. Defaults to `alert` for warning/destructive, `status` otherwise. */
  role?: "status" | "alert";
  className?: string;
};

/**
 * Inline status / feedback surface (success, info, warning, error) shown after a
 * mutation or to flag a stale/attention state. Semantic tokens only — no ad-hoc
 * hex/Tailwind colors at call sites. Presentational and server-compatible.
 */
export function FeedbackBanner({ tone, icon: IconProp, children, action, role, className }: FeedbackBannerProps) {
  const t = TONE[tone];
  const Icon = IconProp ?? t.Icon;
  const resolvedRole = role ?? (tone === "warning" || tone === "destructive" ? "alert" : "status");
  return (
    <div
      role={resolvedRole}
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        action ? "flex-col sm:flex-row sm:items-center sm:justify-between" : "items-start",
        t.box,
        className
      )}
    >
      <div className={cn("flex min-w-0 items-start gap-2", action && "flex-1")}>
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} aria-hidden="true" />
        <span className="min-w-0">{children}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
