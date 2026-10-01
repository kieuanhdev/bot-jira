import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const colClasses = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
} as const;

export type MetricGridProps = {
  /** Number of columns at the widest breakpoint; smaller breakpoints scale down. */
  columns?: keyof typeof colClasses;
  className?: string;
  children: ReactNode;
};

/**
 * Responsive layout wrapper for a row of `MetricCard`s. Presentational and
 * server-compatible (no hooks).
 */
export function MetricGrid({ columns = 4, className, children }: MetricGridProps) {
  return <div className={cn("grid gap-3", colClasses[columns], className)}>{children}</div>;
}
