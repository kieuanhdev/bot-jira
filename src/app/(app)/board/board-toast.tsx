"use client";

import { memo } from "react";

export const BoardToast = memo(function BoardToast({ toast }: { toast: string | null }) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-2.5 text-sm font-semibold text-popover-foreground shadow-[var(--shadow-pop)]"
    >
      {toast}
    </div>
  );
});
