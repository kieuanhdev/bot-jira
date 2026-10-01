"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { SearchField } from "@/components/shared/search-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";
import { NOTIFICATION_CATEGORIES } from "./lib/notification-metadata";

type NotificationFiltersProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  tab: "all" | "unread" | "read";
  onTabChange: (tab: "all" | "unread" | "read") => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  typeCounts: Record<string, number>;
  stats: { total: number; unread: number; read: number };
  hasActiveFilters: boolean;
  onResetFilters: () => void;
};

export function NotificationFilters({
  searchQuery,
  onSearchChange,
  tab,
  onTabChange,
  selectedType,
  onTypeChange,
  typeCounts,
  stats,
  hasActiveFilters,
  onResetFilters,
}: NotificationFiltersProps) {
  return (
    <div className="space-y-3 bg-card p-4 rounded-xl border border-border shadow-xs">
      {/* Row 1: Search input + Status tabs */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <SearchField
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Tìm kiếm theo tiêu đề, nội dung, mã task..."
          className="flex-1"
        />

        <SegmentedControl
          items={[
            { value: "all", label: "Tất cả", count: stats.total },
            { value: "unread", label: "Chưa đọc", count: stats.unread },
            { value: "read", label: "Đã đọc", count: stats.read },
          ]}
          value={tab}
          onChange={(v) => onTabChange(v)}
          tone="neutral"
          aria-label="Lọc theo trạng thái đọc"
          className="shrink-0"
        />
      </div>

      {/* Row 2: Category Filter Pills (Tags) */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Phân loại theo danh mục:
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="ml-auto text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Đặt lại bộ lọc
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const isSelected = selectedType === cat.id;
            const count = typeCounts[cat.id] ?? 0;
            const Icon = cat.icon;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onTypeChange(isSelected && cat.id !== "all" ? "all" : cat.id)}
                className={cn(
                  "group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 cursor-pointer border transition-all duration-150",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground hover:bg-muted/40"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-colors",
                    isSelected ? "text-primary-foreground" : cat.color.text
                  )}
                  aria-hidden="true"
                />
                <span>{cat.shortLabel}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-semibold",
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/15"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
