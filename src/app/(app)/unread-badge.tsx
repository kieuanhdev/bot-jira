"use client";

import { useUnreadCount } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export type UnreadBadgeVariant = "inline" | "collapsed" | "mobile-bell";

interface UnreadBadgeProps {
  variant?: UnreadBadgeVariant;
  className?: string;
}

export function UnreadBadge({ variant = "inline", className }: UnreadBadgeProps) {
  const unreadCount = useUnreadCount();

  if (unreadCount <= 0) return null;

  const label = unreadCount > 99 ? "99+" : unreadCount;

  if (variant === "collapsed") {
    return (
      <span
        className={cn(
          "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-destructive-foreground tabular-nums ring-2 ring-card",
          className
        )}
      >
        {label}
      </span>
    );
  }

  if (variant === "mobile-bell") {
    return (
      <span
        className={cn(
          "absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground tabular-nums",
          className
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-2xs font-semibold text-destructive-foreground tabular-nums",
        className
      )}
    >
      {label}
    </span>
  );
}
