"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Extra content rendered in the header under the title/description. */
  headerExtra?: ReactNode;
  /** Pinned footer rendered below the scrollable body. */
  footer?: ReactNode;
  className?: string;
  side?: "right" | "left";
  /** Called before Esc closes the sheet; call `preventDefault()` to keep it open. */
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  headerExtra,
  footer,
  className,
  side = "right",
  onEscapeKeyDown,
}: SheetProps) {
  const hasHeader = Boolean(title || description);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onEscapeKeyDown={onEscapeKeyDown}
          className={cn(
            "fixed inset-y-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-[var(--shadow-pop)] duration-200 ease-out focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none",
            side === "right"
              ? "right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
              : "left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
            className
          )}
        >
          {hasHeader ? (
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title
                  className={cn("text-lg font-semibold text-foreground", !title && "sr-only")}
                >
                  {title ?? "Panel"}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
                {headerExtra && <div className="mt-2">{headerExtra}</div>}
              </div>
              <DialogPrimitive.Close
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <DialogPrimitive.Title className="sr-only">Panel</DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="absolute top-3 right-3 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </>
          )}
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
