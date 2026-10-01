"use client";

import { BellOff, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { getErrorMessage } from "@/lib/api-client";
import type { NotificationDateGroup } from "./lib/notification-metadata";
import { NotificationRow } from "./notification-row";
import type { Notification } from "@/hooks/use-notifications";

type NotificationListProps = {
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  groups: NotificationDateGroup[];
  totalFiltered: number;
  searchQuery: string;
  tab: "all" | "unread" | "read";
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  expandedBodies: Set<string>;
  onToggleExpand: (e: React.MouseEvent, id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onCardClick: (n: Notification) => void;
  onToggleRead: (e: React.MouseEvent, n: Notification) => void;
  onDeleteSingle: (e: React.MouseEvent, n: Notification) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
};

export function NotificationList({
  isLoading,
  error,
  onRetry,
  groups,
  totalFiltered,
  searchQuery,
  tab,
  hasActiveFilters,
  onResetFilters,
  expandedBodies,
  onToggleExpand,
  selectedIds,
  onToggleSelect,
  onCardClick,
  onToggleRead,
  onDeleteSingle,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
}: NotificationListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-border p-4 bg-card">
            <Skeleton className="h-4 w-4 rounded-sm mt-1" />
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Không thể tải danh sách thông báo"
        message={getErrorMessage(error, "Có lỗi xảy ra khi kết nối tới máy chủ thông báo. Vui lòng kiểm tra kết nối mạng và thử lại.")}
        onRetry={onRetry}
      />
    );
  }

  if (totalFiltered === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={
          searchQuery
            ? "Không tìm thấy thông báo nào phù hợp"
            : tab === "unread"
            ? "Bạn đã xem hết thông báo mới!"
            : "Chưa có thông báo nào"
        }
        hint={
          searchQuery ? (
            <>Không có thông báo nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;. Hãy thử tìm từ khóa khác hoặc xóa bộ lọc.</>
          ) : tab === "unread" ? (
            "Tuyệt vời! Không có hoạt động mới nào cần xử lý lúc này."
          ) : (
            "Các thông báo về bình luận Jira, chuyển trạng thái task và cảnh báo hệ thống sẽ hiển thị tại đây."
          )
        }
        action={
          hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={onResetFilters} className="cursor-pointer gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Xóa tất cả bộ lọc
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ group, items }) => (
        <div key={group} className="space-y-2.5">
          {/* Date group badge */}
          <div className="sticky top-14 z-10 bg-background/95 backdrop-blur-xs py-1 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-full border border-border/50">
              {group}
            </span>
            <span className="h-px flex-1 bg-border/40" />
          </div>

          {/* Notification Cards */}
          <div className="space-y-2">
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                isSelected={selectedIds.has(n.id)}
                isExpanded={expandedBodies.has(n.id)}
                onCardClick={onCardClick}
                onToggleSelect={onToggleSelect}
                onToggleRead={onToggleRead}
                onDeleteSingle={onDeleteSingle}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Load More Button */}
      {hasNextPage && (
        <div className="pt-4 text-center">
          <Button
            variant="outline"
            onClick={onFetchNextPage}
            disabled={isFetchingNextPage}
            className="cursor-pointer gap-2 text-xs h-9 px-6 border-primary/30 text-primary hover:bg-primary/10"
          >
            {isFetchingNextPage ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Đang tải thêm dữ liệu…
              </>
            ) : (
              "Tải thêm thông báo cũ hơn"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
