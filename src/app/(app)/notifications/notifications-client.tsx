"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notificationsKeys } from "@/lib/query-keys";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  Trash2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationsSummaryCards } from "./notifications-summary-cards";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useMarkNotifications,
  useDeleteNotifications,
  type Notification,
  type NotificationResponse,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { NotificationFilters } from "./notification-filters";
import { NotificationList } from "./notification-list";
import { NotificationsBatchBar } from "./notifications-batch-bar";
import { useNotificationFilters } from "./hooks/use-notification-filters";
import { useNotificationSelection } from "./hooks/use-notification-selection";

export function NotificationsClient() {
  const router = useRouter();
  const qc = useQueryClient();

  // URL-backed filters state [D15]
  const {
    tab,
    setTab,
    selectedType,
    setSelectedType,
    severityFilter,
    setSeverityFilter,
    searchQuery,
    setSearchQuery,
    hasActiveFilters,
    resetFilters,
    unreadOnly,
    typeFilter,
  } = useNotificationFilters();

  // UI state
  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());
  const [sessionReadIds, setSessionReadIds] = useState<Set<string>>(new Set());
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) {
    setPrevTab(tab);
    setSessionReadIds(new Set());
  }
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<"selected" | "allRead" | null>(null);

  // Infinite query fetching notifications with maxPages constraint
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    queryKey: notificationsKeys.infinite({ unreadOnly, type: typeFilter }),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (unreadOnly) params.set("unreadOnly", "1");
      if (typeFilter) params.set("type", typeFilter);
      if (pageParam) params.set("cursor", pageParam);
      return api<NotificationResponse>(`/api/notify?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    maxPages: 5,
    // SSE provides immediate invalidation; 60s interval is a fallback
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { markRead, markUnread, markAllRead, isPending: isMarkPending } = useMarkNotifications();
  const { deleteNotifications, deleteAllRead, isDeleting } = useDeleteNotifications();

  // Flattened items from all fetched pages (up to maxPages * 30 items)
  const rawItems = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  const totalUnreadCount = data?.pages[0]?.unreadCount ?? 0;

  // Client-side filtering for read/unread tab, keyword search, severity
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      if (tab === "read" && !item.read) return false;
      if (tab === "unread" && item.read && !sessionReadIds.has(item.id)) return false;

      if (severityFilter === "attention") {
        if (item.severity !== "warning" && item.severity !== "danger") return false;
      } else if (severityFilter === "info") {
        if (item.severity === "warning" || item.severity === "danger") return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = item.title.toLowerCase().includes(q);
        const inBody = item.body?.toLowerCase().includes(q);
        const inType = item.type.toLowerCase().includes(q);
        const inKey = item.eventKey?.toLowerCase().includes(q);
        if (!inTitle && !inBody && !inType && !inKey) return false;
      }

      return true;
    });
  }, [rawItems, tab, severityFilter, searchQuery, sessionReadIds]);

  const allFilteredIds = useMemo(() => filteredItems.map((n) => n.id), [filteredItems]);

  // Bulk selection hook
  const {
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    removeIds,
  } = useNotificationSelection({ filteredIds: allFilteredIds });

  // Counts per category for pills
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = { all: rawItems.length };
    for (const item of rawItems) {
      map[item.type] = (map[item.type] || 0) + 1;
    }
    return map;
  }, [rawItems]);

  // Statistics (noting loaded pages context)
  const stats = useMemo(() => {
    const total = rawItems.length;
    const unread = rawItems.filter((n) => !n.read).length;
    const read = total - unread;
    const attention = rawItems.filter((n) => n.severity === "warning" || n.severity === "danger").length;
    return { total, unread, read, attention };
  }, [rawItems]);

  const handleMarkSingleRead = (id: string) => {
    setSessionReadIds((prev) => new Set(prev).add(id));
    void markRead([id]);
  };

  const handleCardClick = (n: Notification) => {
    if (!n.read) {
      handleMarkSingleRead(n.id);
    }
    if (n.link) {
      if (n.link.startsWith("http://") || n.link.startsWith("https://")) {
        window.open(n.link, "_blank", "noopener,noreferrer");
      } else {
        router.push(n.link);
      }
    } else if (n.sourceLink) {
      window.open(n.sourceLink, "_blank", "noopener,noreferrer");
    } else if (n.body && n.body.length > 140) {
      setExpandedBodies((prev) => {
        const next = new Set(prev);
        if (next.has(n.id)) next.delete(n.id);
        else next.add(n.id);
        return next;
      });
    }
  };

  const handleToggleRead = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (n.read) {
      setSessionReadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      await markUnread([n.id]);
    } else {
      setSessionReadIds((prev) => new Set(prev).add(n.id));
      await markRead([n.id]);
    }
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleDeleteSingle = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    await deleteNotifications([n.id]);
    removeIds([n.id]);
  };

  const handleMarkSelectedRead = async () => {
    if (selectedCount === 0) return;
    await markRead(Array.from(selectedIds));
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleMarkSelectedUnread = async () => {
    if (selectedCount === 0) return;
    await markUnread(Array.from(selectedIds));
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteDialog === "selected") {
      if (selectedCount > 0) {
        await deleteNotifications(Array.from(selectedIds));
        clearSelection();
      }
    } else if (confirmDeleteDialog === "allRead") {
      await deleteAllRead();
      clearSelection();
    }
    setConfirmDeleteDialog(null);
  };

  const toggleBodyExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        icon={Bell}
        title="Trung tâm thông báo"
        description="Theo dõi toàn diện các trao đổi Jira, luồng phát hành, sự cố và cảnh báo SLA."
        badge={
          totalUnreadCount > 0 ? (
            <Badge variant="danger" className="h-5 px-2 text-2xs font-semibold tabular-nums">
              {totalUnreadCount > 99 ? "99+" : totalUnreadCount} mới
            </Badge>
          ) : undefined
        }
        actions={
          <>
            {totalUnreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead()}
                disabled={isMarkPending}
                className="cursor-pointer gap-1.5 text-xs h-9 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Đánh dấu tất cả đã đọc
              </Button>
            )}

            {stats.read > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteDialog("allRead")}
                disabled={isDeleting}
                className="cursor-pointer gap-1.5 text-xs h-9 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Dọn dẹp đã đọc
              </Button>
            )}

            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer gap-1.5 text-xs h-9 text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                Cài đặt
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              className="cursor-pointer h-9 w-9 text-muted-foreground hover:text-foreground"
              title="Làm mới danh sách"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin text-primary")} aria-hidden="true" />
            </Button>
          </>
        }
        className="pb-4 border-b border-border"
      />

      {/* Quick Summary Metric Cards with Scope Subtitle */}
      <div className="space-y-1.5">
        <NotificationsSummaryCards
          total={stats.total}
          unread={totalUnreadCount > 0 ? totalUnreadCount : stats.unread}
          read={stats.read}
          attention={stats.attention}
          tab={tab}
          severityFilter={severityFilter}
          onSelectTab={(t) => {
            setTab(t);
            setSeverityFilter("all");
          }}
          onToggleAttention={() => setSeverityFilter((prev) => (prev === "attention" ? "all" : "attention"))}
        />
        <p className="text-2xs text-muted-foreground/70 italic px-0.5">
          * Thống kê tính trên các trang thông báo đã tải (tối đa 5 trang gần nhất). Số chưa đọc tổng thể: {totalUnreadCount}.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <NotificationFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        tab={tab}
        onTabChange={(t) => {
          setTab(t);
          setSeverityFilter("all");
        }}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        typeCounts={typeCounts}
        stats={stats}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      />

      {/* Floating / Sticky Batch Actions Bar */}
      <NotificationsBatchBar
        selectedCount={selectedCount}
        isAllSelected={isAllSelected}
        onToggleSelectAll={toggleSelectAll}
        onMarkRead={handleMarkSelectedRead}
        onMarkUnread={handleMarkSelectedUnread}
        onDelete={() => setConfirmDeleteDialog("selected")}
        onClearSelection={clearSelection}
        isMarkPending={isMarkPending}
        isDeleting={isDeleting}
      />

      {/* Select All Row (when not in floating mode and notifications exist) */}
      {filteredItems.length > 0 && selectedCount === 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all-filtered"
              checked={isAllSelected}
              onCheckedChange={toggleSelectAll}
              className="cursor-pointer"
            />
            <label
              htmlFor="select-all-filtered"
              className="cursor-pointer select-none font-medium hover:text-foreground transition-colors"
            >
              Chọn tất cả {filteredItems.length} thông báo trong danh sách
            </label>
          </div>
          <span className="text-2xs text-muted-foreground/80">
            Hiển thị {filteredItems.length} kết quả
          </span>
        </div>
      )}

      {/* Windowed Notifications List */}
      <NotificationList
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        items={filteredItems}
        totalFiltered={filteredItems.length}
        searchQuery={searchQuery}
        tab={tab}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        expandedBodies={expandedBodies}
        onToggleExpand={toggleBodyExpand}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelectOne}
        onCardClick={handleCardClick}
        onToggleRead={handleToggleRead}
        onDeleteSingle={handleDeleteSingle}
        onMarkRead={handleMarkSingleRead}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onFetchNextPage={() => fetchNextPage()}
      />

      {/* Confirmation Dialog for Deletion */}
      <ConfirmDialog
        open={confirmDeleteDialog !== null}
        onOpenChange={(open) => !open && setConfirmDeleteDialog(null)}
        tone="destructive"
        icon={Trash2}
        title={
          confirmDeleteDialog === "allRead"
            ? "Dọn dẹp tất cả thông báo đã đọc?"
            : `Xóa ${selectedCount} thông báo đã chọn?`
        }
        description={
          confirmDeleteDialog === "allRead"
            ? "Hành động này sẽ xóa toàn bộ các thông báo đã đọc khỏi lịch sử của bạn. Bạn không thể hoàn tác thao tác này."
            : `Hành động này sẽ xóa vĩnh viễn ${selectedCount} thông báo đã được chọn. Bạn có chắc chắn muốn tiếp tục?`
        }
        onConfirm={handleConfirmDelete}
        confirmLabel="Xác nhận xóa"
        cancelLabel="Hủy bỏ"
        pending={isDeleting}
      />
    </div>
  );
}
