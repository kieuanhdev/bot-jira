"use client";

import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogTone = "default" | "destructive";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Decorative icon shown before the title. */
  icon?: ComponentType<{ className?: string }>;
  /** Supporting copy under the title. */
  description?: ReactNode;
  /** Optional extra content between the description and the footer (e.g. a notes list). */
  children?: ReactNode;
  onConfirm: () => void;
  /** Confirm button label (default: "Xác nhận"). */
  confirmLabel?: ReactNode;
  /** Cancel button label (default: "Hủy"). */
  cancelLabel?: ReactNode;
  /** `destructive` tints the title/icon red and uses a destructive confirm button. */
  tone?: ConfirmDialogTone;
  /** While the async action is in flight: blocks close and double-submit. */
  pending?: boolean;
  /** Disable the confirm button without implying a pending state (e.g. nothing selected). */
  disabled?: boolean;
  /** Optional inline error shown above the footer. */
  error?: ReactNode;
  className?: string;
};

/**
 * One-step confirmation dialog (delete, run, submit). For pure confirmations only —
 * multi-field forms keep using Radix `Dialog` directly or a domain dialog.
 *
 * `pending` blocks close/Escape/overlay and double-submit; `disabled` only blocks the
 * confirm action. Focus returns to the trigger automatically via Radix.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  icon: Icon,
  description,
  children,
  onConfirm,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  tone = "default",
  pending = false,
  disabled = false,
  error,
  className,
}: ConfirmDialogProps) {
  const destructive = tone === "destructive";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", destructive && "text-destructive")}>
            {Icon ? (
              <Icon className={cn("h-5 w-5", destructive ? "text-destructive" : "text-primary")} aria-hidden="true" />
            ) : null}
            <span>{title}</span>
          </DialogTitle>
          {description ? <DialogDescription className="pt-1 text-xs sm:text-sm text-muted-foreground">{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {error ? (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
        <DialogFooter className="mt-3 flex gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer text-xs"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            size="sm"
            className="cursor-pointer gap-1.5 text-xs"
            onClick={onConfirm}
            disabled={pending || disabled}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
