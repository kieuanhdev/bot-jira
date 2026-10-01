"use client";

import {
  Check,
  RotateCcw,
  ExternalLink,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getCategoryConfig, formatRelativeTimeVi, formatFullTimeVi } from "./lib/notification-metadata";
import type { Notification } from "@/hooks/use-notifications";

type NotificationRowProps = {
  notification: Notification;
  isSelected: boolean;
  isExpanded: boolean;
  onCardClick: (n: Notification) => void;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onToggleRead: (e: React.MouseEvent, n: Notification) => void;
  onDeleteSingle: (e: React.MouseEvent, n: Notification) => void;
  onToggleExpand: (e: React.MouseEvent, id: string) => void;
};

export function NotificationRow({
  notification: n,
  isSelected,
  isExpanded,
  onCardClick,
  onToggleSelect,
  onToggleRead,
  onDeleteSingle,
  onToggleExpand,
}: NotificationRowProps) {
  const isUnread = !n.read;
  const category = getCategoryConfig(n.type);
  const CategoryIcon = category.icon;

  return (
    <div
      onClick={() => onCardClick(n)}
      tabIndex={0}
      role="button"
      aria-label={`${n.title}${isUnread ? " (chưa đọc)" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick(n);
        }
      }}
      className={cn(
        "group relative flex items-start gap-3.5 rounded-xl border p-4 text-sm transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary select-none",
        isSelected
          ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
          : isUnread
          ? "bg-card border-l-[4px] border-l-primary border-t-border border-r-border border-b-border hover:border-primary/50 hover:shadow-xs hover:-translate-y-[1px]"
          : "bg-card border-border hover:border-muted-foreground/30 hover:bg-muted/20 text-muted-foreground hover:text-foreground hover:-translate-y-[1px]"
      )}
    >
      {/* Checkbox for bulk actions */}
      <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(n.id)}
          aria-label={`Chọn thông báo ${n.title}`}
          className={cn(
            "cursor-pointer transition-opacity",
            isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-100"
          )}
        />
      </div>

      {/* Category Avatar Icon */}
      <div
        className={cn(
          "shrink-0 rounded-xl p-2.5 h-10 w-10 flex items-center justify-center border shadow-2xs transition-colors",
          category.color.bg,
          category.color.border
        )}
      >
        <CategoryIcon className={cn("h-4 w-4", category.color.text)} aria-hidden="true" />
      </div>

      {/* Main Body */}
      <div className="flex-1 min-w-0">
        {/* Title & Metadata Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className={cn(
                "font-semibold text-sm tracking-tight break-words",
                isUnread ? "text-foreground font-bold" : "text-foreground/80 font-medium"
              )}
            >
              {n.title}
            </span>

            {isUnread && (
              <Badge variant="info" className="h-4 px-1.5 text-[10px] font-semibold">
                Mới
              </Badge>
            )}

            <Badge variant={category.color.badge} className="h-4 px-1.5 text-[10px] font-medium">
              {category.shortLabel}
            </Badge>

            {n.severity && n.severity !== "info" && (
              <Badge
                variant={n.severity === "danger" ? "danger" : "warning"}
                className="h-4 px-1.5 text-[10px] font-semibold uppercase tracking-wider"
              >
                {n.severity === "danger" ? "Khẩn cấp" : "Cảnh báo"}
              </Badge>
            )}
          </div>

          {/* Timestamp */}
          <span
            className="text-xs text-muted-foreground/80 shrink-0 tabular-nums"
            title={formatFullTimeVi(n.createdAt)}
          >
            {formatRelativeTimeVi(n.createdAt)}
          </span>
        </div>

        {/* Body Content */}
        {n.body && (
          <div className="mt-1.5">
            <p
              className={cn(
                "text-xs leading-relaxed text-muted-foreground break-words",
                !isExpanded && "line-clamp-2"
              )}
            >
              {n.body}
            </p>
            {n.body.length > 140 && (
              <button
                type="button"
                onClick={(e) => onToggleExpand(e, n.id)}
                className="mt-1 text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
              >
                {isExpanded ? (
                  <>Thu gọn <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Xem thêm <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
        )}

        {/* Card Footer Actions */}
        <div className="mt-3 pt-2 flex items-center justify-between border-t border-border/40 text-xs">
          {/* Resource link */}
          {n.link ? (
            <span className="text-primary group-hover:underline inline-flex items-center gap-1 font-medium text-xs">
              Xem chi tiết công việc
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
              <Info className="h-3 w-3" aria-hidden="true" />
              Thông báo nội bộ
            </span>
          )}

          {/* Quick Action Icons */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => onToggleRead(e, n)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
              title={isUnread ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"}
            >
              {isUnread ? (
                <>
                  <Check className="h-3 w-3 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span className="hidden sm:inline">Đã đọc</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Chưa đọc</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => onDeleteSingle(e, n)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              title="Xóa thông báo này"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
