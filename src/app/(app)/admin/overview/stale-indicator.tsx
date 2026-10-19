"use client";

import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/hooks/use-now";
import { timeAgo } from "@/lib/utils";

export interface StaleIndicatorProps {
  lastUpdated: number | null;
}

/**
 * Isolated stale indicator component.
 * Encapsulates the 15-second `useNow()` tick so only this small badge re-renders
 * rather than the entire AdminOverview page tree.
 */
export function StaleIndicator({ lastUpdated }: StaleIndicatorProps) {
  const now = useNow();

  if (!lastUpdated) return null;

  const isStale = Boolean(now > 0 && now - lastUpdated > 90_000);

  return (
    <span className="flex items-center gap-1.5">
      <span>• Cập nhật {timeAgo(new Date(lastUpdated).toISOString())}</span>
      {isStale && (
        <Badge variant="warning" className="gap-1 text-2xs">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          Dữ liệu cũ
        </Badge>
      )}
    </span>
  );
}
