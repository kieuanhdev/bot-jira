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
  Check,
  RefreshCw,
  X,
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
import { groupNotificationsByDate } from "./lib/notification-metadata";
import { NotificationFilters } from "./notification-filters";
import { NotificationList } from "./notification-list";

export function NotificationsClient() {
  const router = useRouter();
  const qc = useQueryClient();

  // Filters state
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "attention" | "info">("all");

  // Selection & UI state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<"selected" | "allRead" | null>(null);

  const unreadOnly = tab === "unread";
  const typeFilter = selectedType === "all" ? undefined : selectedType;

  // Infinite query fetching notifications
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
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { markRead, markUnread, markAllRead, isPending: isMarkPending } = useMarkNotifications();
  const { deleteNotifications, deleteAllRead, isDeleting } = useDeleteNotifications();

  // Flattened items from all fetched pages
  const rawItems = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  const totalUnreadCount = data?.pages[0]?.unreadCount ?? 0;

  // Client-side filtering for read/unread tab, keyword search, severity
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      if (tab === "read" && !item.read) return false;
      if (tab === "unread" && item.read) return false;

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
  }, [rawItems, tab, severityFilter, searchQuery]);

  // Counts per category for pills
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = { all: rawItems.length };
    for (const item of rawItems) {
      map[item.type] = (map[item.type] || 0) + 1;
    }
    return map;
  }, [rawItems]);

  const groupedItems = useMemo(() => {
    return groupNotificationsByDate(filteredItems);
  }, [filteredItems]);

  // Statistics
  const stats = useMemo(() => {
    const total = rawItems.length;
    const unread = rawItems.filter((n) => !n.read).length;
    const read = total - unread;
    const attention = rawItems.filter((n) => n.severity === "warning" || n.severity === "danger").length;
    return { total, unread, read, attention };
  }, [rawItems]);

  // Bulk selection helpers
  const allFilteredIds = useMemo(() => filteredItems.map((n) => n.id), [filteredItems]);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  };

  const toggleSelectOne = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCardClick = (n: Notification) => {
    if (!n.read) {
      void markRead([n.id]);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleToggleRead = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (n.read) {
      await markUnread([n.id]);
    } else {
      await markRead([n.id]);
    }
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleDeleteSingle = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    await deleteNotifications([n.id]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(n.id);
      return next;
    });
  };

  const handleMarkSelectedRead = async () => {
    if (selectedIds.size === 0) return;
    await markRead(Array.from(selectedIds));
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleMarkSelectedUnread = async () => {
    if (selectedIds.size === 0) return;
    await markUnread(Array.from(selectedIds));
    qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteDialog === "selected") {
      if (selectedIds.size > 0) {
        await deleteNotifications(Array.from(selectedIds));
        setSelectedIds(new Set());
      }
    } else if (confirmDeleteDialog === "allRead") {
      await deleteAllRead();
      setSelectedIds(new Set());
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

  const resetFilters = () => {
    setTab("all");
    setSelectedType("all");
    setSearchQuery("");
    setSeverityFilter("all");
  };

  const hasActiveFilters = selectedType !== "all" || severityFilter !== "all" || !!searchQuery;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page Header */}
      <PageHeader
        icon={Bell}
        title="Trung tâm thông báo"
        description="Theo dõi toàn diện các trao đổi Jira, luồng phát hành, sự cố và cảnh báo SLA."
        badge={
          totalUnreadCount > 0 ? (
            <Badge variant="danger" className="h-5 px-2 text-[11px] font-semibold tabular-nums">
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

      {/* Quick Summary Metric Cards */}
      <NotificationsSummaryCards
        total={stats.total}
        unread={stats.unread}
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

      {/* Floating / Sticky Batch Actions Bar when items are selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-30 flex items-center justify-between gap-3 p-3 rounded-xl bg-card border-2 border-primary shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Chọn hoặc bỏ chọn tất cả"
            />
            <span className="text-xs sm:text-sm font-semibold text-foreground">
              Đã chọn <span className="text-primary tabular-nums">{selectedIds.size}</span> thông báo
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarkSelectedRead}
              disabled={isMarkPending}
              className="cursor-pointer gap-1 text-xs h-8 text-foreground hover:border-primary"
            >
              <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span className="hidden sm:inline">Đánh dấu đã đọc</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarkSelectedUnread}
              disabled={isMarkPending}
              className="cursor-pointer gap-1 text-xs h-8 text-foreground hover:border-primary"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="hidden sm:inline">Đánh dấu chưa đọc</span>
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteDialog("selected")}
              disabled={isDeleting}
              className="cursor-pointer gap-1 text-xs h-8"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xóa ({selectedIds.size})</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSelectedIds(new Set())}
              className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Bỏ chọn tất cả"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Select All Row (when not in floating mode and notifications exist) */}
      {filteredItems.length > 0 && selectedIds.size === 0 && (
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
          <span className="text-[11px] text-muted-foreground/80">
            Hiển thị {filteredItems.length} kết quả
          </span>
        </div>
      )}

      {/* Notifications List Content */}
      <NotificationList
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        groups={groupedItems}
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
            : `Xóa ${selectedIds.size} thông báo đã chọn?`
        }
        description={
          confirmDeleteDialog === "allRead"
            ? "Hành động này sẽ xóa toàn bộ các thông báo đã đọc khỏi lịch sử của bạn. Bạn không thể hoàn tác thao tác này."
            : `Hành động này sẽ xóa vĩnh viễn ${selectedIds.size} thông báo đã được chọn. Bạn có chắc chắn muốn tiếp tục?`
        }
        onConfirm={handleConfirmDelete}
        confirmLabel="Xác nhận xóa"
        cancelLabel="Hủy bỏ"
        pending={isDeleting}
      />
    </div>
  );
}
