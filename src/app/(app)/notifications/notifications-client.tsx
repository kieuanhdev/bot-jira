"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  Bell,
  BellOff,
  CheckCheck,
  Check,
  RotateCcw,
  ExternalLink,
  MessageSquare,
  ArrowRightLeft,
  Clock,
  Rocket,
  ShieldAlert,
  GitBranch,
  Cpu,
  RefreshCw,
  Filter,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMarkNotifications,
  type Notification,
  type NotificationResponse,
} from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/utils";

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả các loại" },
  { value: "comment", label: "Bình luận (comment)" },
  { value: "transition", label: "Chuyển trạng thái (transition)" },
  { value: "stale", label: "Tồn đọng / SLA (stale)" },
  { value: "release", label: "Bản phát hành (release)" },
  { value: "sentry", label: "Lỗi Sentry (sentry)" },
  { value: "ci", label: "Build & CI (ci)" },
  { value: "ai", label: "AI ước lượng (ai)" },
  { value: "system", label: "Hệ thống (system)" },
];

function getNotificationIcon(type: string) {
  switch (type) {
    case "comment":
      return <MessageSquare className="h-4 w-4 text-blue-500" aria-hidden="true" />;
    case "transition":
      return <ArrowRightLeft className="h-4 w-4 text-purple-500" aria-hidden="true" />;
    case "stale":
      return <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />;
    case "release":
      return <Rocket className="h-4 w-4 text-teal-500" aria-hidden="true" />;
    case "sentry":
      return <ShieldAlert className="h-4 w-4 text-rose-500" aria-hidden="true" />;
    case "ci":
      return <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
    case "ai":
      return <Cpu className="h-4 w-4 text-indigo-500" aria-hidden="true" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

function groupNotificationsByDate(items: Notification[]): { group: string; items: Notification[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { [key: string]: Notification[] } = {
    "Hôm nay": [],
    "Hôm qua": [],
    "Cũ hơn": [],
  };

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    const checkDate = new Date(itemDate);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate.getTime() === today.getTime()) {
      groups["Hôm nay"].push(item);
    } else if (checkDate.getTime() === yesterday.getTime()) {
      groups["Hôm qua"].push(item);
    } else {
      groups["Cũ hơn"].push(item);
    }
  }

  return Object.entries(groups)
    .filter(([_, list]) => list.length > 0)
    .map(([group, list]) => ({ group, items: list }));
}

export function NotificationsClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  const unreadOnly = tab === "unread";
  const typeFilter = selectedType === "all" ? undefined : selectedType;

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["notifications", "infinite", { unreadOnly, type: typeFilter }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "25");
      if (unreadOnly) params.set("unreadOnly", "1");
      if (typeFilter) params.set("type", typeFilter);
      if (pageParam) params.set("cursor", pageParam);
      return api<NotificationResponse>(`/api/notify?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const { markRead, markUnread, markAllRead, isPending } = useMarkNotifications();

  const allItems = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  const totalUnreadCount = data?.pages[0]?.unreadCount ?? 0;

  const groupedItems = useMemo(() => {
    return groupNotificationsByDate(allItems);
  }, [allItems]);

  const handleItemClick = (n: Notification) => {
    if (!n.read) {
      markRead([n.id]);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleMarkAll = async () => {
    await markAllRead();
    qc.invalidateQueries({ queryKey: ["notifications", "infinite"] });
  };

  const handleToggleRead = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (n.read) {
      await markUnread([n.id]);
    } else {
      await markRead([n.id]);
    }
    qc.invalidateQueries({ queryKey: ["notifications", "infinite"] });
  };

  return (
    <div className="container max-w-4xl py-6 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
            Trung tâm thông báo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi mọi hoạt động, bình luận, cảnh báo SLA và phát hành của bạn.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalUnreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              disabled={isPending}
              className="cursor-pointer gap-1.5 text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Đánh dấu tất cả đã đọc
            </Button>
          )}
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="cursor-pointer text-xs">
              Cài đặt thông báo
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")} className="w-auto">
          <TabsList className="grid grid-cols-2 w-56">
            <TabsTrigger value="all" className="cursor-pointer text-xs">
              Tất cả
            </TabsTrigger>
            <TabsTrigger value="unread" className="cursor-pointer text-xs flex items-center gap-1.5">
              Chưa đọc
              {totalUnreadCount > 0 && (
                <Badge variant="info" className="px-1.5 py-0 text-[10px] leading-tight">
                  {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-52 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content List */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 rounded-lg border border-border p-4">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-12 text-center rounded-lg border border-border flex flex-col items-center justify-center gap-3">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-base font-medium">Không thể tải danh sách thông báo</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="cursor-pointer gap-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Thử lại
            </Button>
          </div>
        ) : allItems.length === 0 ? (
          <div className="py-16 text-center rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
            <div className="rounded-full bg-muted p-4 text-muted-foreground mb-1">
              <BellOff className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-foreground">Không có thông báo nào</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {unreadOnly
                ? "Bạn đã đọc hết tất cả các thông báo trong mục này."
                : "Chưa có thông báo nào phù hợp với bộ lọc được chọn."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedItems.map(({ group, items }) => (
              <div key={group} className="space-y-2">
                <div className="sticky top-14 z-10 bg-background/90 backdrop-blur-xs py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((n) => {
                    const isUnread = !n.read;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleItemClick(n)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleItemClick(n);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${n.title}${isUnread ? " (chưa đọc)" : ""}`}
                        className={`group relative flex items-start gap-4 rounded-lg border p-4 text-sm transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isUnread
                            ? "bg-primary/5 dark:bg-primary/10 border-primary/25 hover:bg-primary/10 dark:hover:bg-primary/15"
                            : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 rounded-full bg-background border border-border p-2 h-9 w-9 flex items-center justify-center shadow-xs">
                          {getNotificationIcon(n.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`truncate font-semibold text-sm ${
                                  isUnread ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {n.title}
                              </span>
                              {isUnread && (
                                <Badge variant="info" className="text-[10px] px-1.5 py-0 h-4">
                                  Mới
                                </Badge>
                              )}
                              {n.severity && n.severity !== "info" && (
                                <Badge
                                  variant={n.severity === "danger" ? "danger" : "warning"}
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {n.severity}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {timeAgo(n.createdAt)}
                            </span>
                          </div>

                          {n.body && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                              {n.body}
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between text-xs pt-1 border-t border-border/40">
                            {n.link ? (
                              <span className="text-primary group-hover:underline inline-flex items-center gap-1 font-medium">
                                Xem chi tiết tài nguyên
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60 text-[11px]">
                                Thông báo nội bộ
                              </span>
                            )}

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleToggleRead(e, n)}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
                              title={isUnread ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"}
                            >
                              {isUnread ? (
                                <>
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  Đánh dấu đã đọc
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                  Đánh dấu chưa đọc
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load More Button */}
            {hasNextPage && (
              <div className="pt-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="cursor-pointer gap-2"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Đang tải thêm…
                    </>
                  ) : (
                    "Tải thêm thông báo cũ hơn"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
