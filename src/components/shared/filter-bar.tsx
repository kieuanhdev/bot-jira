"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type FilterBarProps = {
  /** Primary filter controls (rendered on the left). */
  children?: ReactNode;
  /** Secondary controls, e.g. a `SearchField` (rendered on the right). */
  actions?: ReactNode;
  /** Number of active filters; a reset button is shown when > 0 and `onReset` is set. */
  activeCount?: number;
  onReset?: () => void;
  className?: string;
};

/**
 * Layout-only filter container: a responsive primary (left) / secondary (right)
 * row with an optional "active filter" reset affordance. The page still owns the
 * filter state, query params, and each individual control — this only manages the
 * arrangement and the reset button.
 */
export function FilterBar({ children, actions, activeCount, onReset, className }: FilterBarProps) {
  const showReset = activeCount != null && activeCount > 0 && typeof onReset === "function";

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      <div className="flex items-center gap-2">
        {actions}
        {showReset ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Xóa lọc ({activeCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}
