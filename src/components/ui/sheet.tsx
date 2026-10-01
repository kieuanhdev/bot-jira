"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  side?: "right" | "left";
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  side = "right",
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed top-0 bottom-0 z-50 flex w-full max-w-md flex-col bg-background shadow-xl transition-transform duration-200 ease-out",
          side === "right" ? "right-0" : "left-0",
          open
            ? side === "right" ? "translate-x-0" : "translate-x-0"
            : side === "right" ? "translate-x-full" : "-translate-x-full",
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              {title && (
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </>
  );
}
