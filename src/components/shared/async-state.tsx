"use client";

import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AsyncStateProps = {
  /** When true, render `loadingFallback` and nothing else. */
  loading?: boolean;
  /** When truthy, render `errorFallback` and nothing else. */
  error?: unknown;
  /** When true (and not loading/error), render `emptyFallback`. */
  empty?: boolean;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  emptyFallback?: ReactNode;
  /** Shown only when not loading, not errored, and not empty. */
  children: ReactNode;
};

/**
 * Pure view-composition helper for query-backed content. It does NOT fetch; the
 * caller passes TanStack Query flags and the fallback nodes to render. Precedence:
 * loading > error > empty > children.
 *
 * "use client" because the fallbacks typically contain client components and the
 * error path takes an `onRetry` callback downstream.
 */
export function AsyncState({
  loading,
  error,
  empty,
  loadingFallback,
  errorFallback,
  emptyFallback,
  children,
}: AsyncStateProps) {
  if (loading) return <>{loadingFallback ?? null}</>;
  if (error) return <>{errorFallback ?? null}</>;
  if (empty) return <>{emptyFallback ?? null}</>;
  return <>{children}</>;
}

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
  className?: string;
};

/**
 * Shared error state with an optional retry action. Uses semantic `destructive`
 * tokens (no hardcoded red) and `role="alert"` so it is announced for errors that
 * require attention.
 */
export function ErrorState({
  title = "Đã xảy ra lỗi",
  message,
  onRetry,
  retryLabel = "Thử lại",
  retryDisabled,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className
      )}
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {message ? <p className="mx-auto max-w-sm text-xs text-muted-foreground">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retryDisabled}
          className="text-xs"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
