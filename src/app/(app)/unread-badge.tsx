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
          "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-card",
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
          "absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white tabular-nums",
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
        "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums",
        className
      )}
    >
      {label}
    </span>
  );
}
