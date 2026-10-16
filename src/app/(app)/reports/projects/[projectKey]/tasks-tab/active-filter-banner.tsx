"use client";

import { Filter, X, RotateCcw, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ActiveFilterBannerProps {
  activity: string;
  statusGroup: string | null;
  assignee: string;
  search: string;
  activeActivityLabel?: string;
  activeMemberName?: string;
  onClearActivity: () => void;
  onClearStatusGroup: () => void;
  onClearAssignee: () => void;
  onClearSearch: () => void;
  onResetFilters: () => void;
  onNavigateToOverview?: () => void;
}

export function ActiveFilterBanner({
  activity,
  statusGroup,
  assignee,
  search,
  activeActivityLabel,
  activeMemberName,
  onClearActivity,
  onClearStatusGroup,
  onClearAssignee,
  onClearSearch,
  onResetFilters,
  onNavigateToOverview,
}: ActiveFilterBannerProps) {
  const hasActiveFilters =
    activity !== "all" ||
    (Boolean(statusGroup) && statusGroup !== "all") ||
    assignee !== "all" ||
    Boolean(search.trim());

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs animate-in fade-in duration-200">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Đang áp dụng bộ lọc:
        </span>

        {activity !== "all" && (
          <Badge
            variant="secondary"
            className="gap-1 font-normal bg-card text-foreground border border-border"
          >
            Hoạt động: <strong className="font-semibold">{activeActivityLabel || activity}</strong>
            <button
              type="button"
              onClick={onClearActivity}
              className="hover:text-destructive cursor-pointer ml-0.5"
              title="Xóa lọc hoạt động"
              aria-label="Xóa lọc hoạt động"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        )}

        {Boolean(statusGroup) && statusGroup !== "all" && (
          <Badge
            variant="secondary"
            className="gap-1 font-normal bg-card text-foreground border border-border"
          >
            Trạng thái: <strong className="font-semibold">{statusGroup}</strong>
            <button
              type="button"
              onClick={onClearStatusGroup}
              className="hover:text-destructive cursor-pointer ml-0.5"
              title="Xóa lọc trạng thái"
              aria-label="Xóa lọc trạng thái"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        )}

        {assignee !== "all" && (
          <Badge
            variant="secondary"
            className="gap-1 font-normal bg-card text-foreground border border-border"
          >
            Người làm: <strong className="font-semibold">{activeMemberName || assignee}</strong>
            <button
              type="button"
              onClick={onClearAssignee}
              className="hover:text-destructive cursor-pointer ml-0.5"
              title="Xóa lọc người làm"
              aria-label="Xóa lọc người làm"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        )}

        {Boolean(search.trim()) && (
          <Badge
            variant="secondary"
            className="gap-1 font-normal bg-card text-foreground border border-border"
          >
            Từ khóa: &quot;{search.trim()}&quot;
            <button
              type="button"
              onClick={onClearSearch}
              className="hover:text-destructive cursor-pointer ml-0.5"
              title="Xóa tìm kiếm"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Xóa bộ lọc</span>
        </button>

        {onNavigateToOverview && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToOverview}
            className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {assignee !== "all"
                ? `Quay lại ${activeMemberName || assignee}`
                : "Quay lại Tổng quan"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
