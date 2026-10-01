import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const containerSizes = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
  full: "max-w-none",
} as const;

export type PageContainerProps = {
  /**
   * Width bucket for the page content. Horizontal padding is already applied by
   * the app shell (`<main className="p-4 md:p-6">`), so this only controls the
   * max width and centering — it does not re-pad the page.
   */
  size?: keyof typeof containerSizes;
  className?: string;
  children: ReactNode;
};

/**
 * Standardizes page width and centering. It is intentionally thin: the app shell
 * owns horizontal padding and top spacing, while each page owns its vertical
 * rhythm (e.g. a `flex flex-col gap-*` wrapper around header + content).
 *
 * Presentational and server-compatible (no hooks, no client-only APIs).
 */
export function PageContainer({ size = "default", className, children }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full", containerSizes[size], className)}>
      {children}
    </div>
  );
}
