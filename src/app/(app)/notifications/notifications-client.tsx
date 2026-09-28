"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notificationsKeys } from "@/lib/query-keys";
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
  Search,
  X,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Settings,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useMarkNotifications,
  useDeleteNotifications,
  type Notification,
  type NotificationResponse,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

// Category definitions with icons, labels, and themed color schemes
const CATEGORIES: {
  id: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  color: {
    bg: string;
    text: string;
    border: string;
    badge: "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info";
  };
}[] = [
  {
    id: "all",
    label: "Tất cả loại",
    shortLabel: "Tất cả",
    icon: Bell,
    color: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
      badge: "secondary",
    },
  },
  {
    id: "comment",
    label: "Bình luận (comment)",
    shortLabel: "Bình luận",
    icon: MessageSquare,
    color: {
      bg: "bg-sky-500/10 dark:bg-sky-500/20",
      text: "text-sky-600 dark:text-sky-400",
      border: "border-sky-500/30",
      badge: "info",
    },
  },
  {
    id: "issue",
    label: "Cập nhật task (issue)",
    shortLabel: "Task Jira",
    icon: RefreshCw,
    color: {
      bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
      text: "text-cyan-600 dark:text-cyan-400",
      border: "border-cyan-500/30",
      badge: "info",
    },
  },
  {
    id: "transition",
    label: "Chuyển trạng thái (transition)",
    shortLabel: "Chuyển cột",
    icon: ArrowRightLeft,
    color: {
      bg: "bg-purple-500/10 dark:bg-purple-500/20",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-500/30",
      badge: "secondary",
    },
  },
  {
    id: "stale",
    label: "Tồn đọng & SLA (stale)",
    shortLabel: "SLA / Tồn đọng",
    icon: Clock,
    color: {
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/30",
      badge: "warning",
    },
  },
  {
    id: "release",
    label: "Bản phát hành (release)",
    shortLabel: "Phát hành",
    icon: Rocket,
    color: {
      bg: "bg-teal-500/10 dark:bg-teal-500/20",
      text: "text-teal-600 dark:text-teal-400",
      border: "border-teal-500/30",
      badge: "success",
    },
  },
  {
    id: "sentry",
    label: "Lỗi Sentry (sentry)",
    shortLabel: "Sentry Bug",
    icon: ShieldAlert,
    color: {
      bg: "bg-rose-500/10 dark:bg-rose-500/20",
      text: "text-rose-600 dark:text-rose-400",
      border: "border-rose-500/30",
      badge: "danger",
    },
  },
  {
    id: "ci",
    label: "Build & CI/CD (ci)",
    shortLabel: "Build & CI",
    icon: GitBranch,
    color: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-500/30",
      badge: "success",
    },
  },
  {
    id: "ai",
    label: "AI gợi ý & ước lượng (ai)",
    shortLabel: "AI Gợi ý",
    icon: Sparkles,
    color: {
      bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
      text: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-500/30",
      badge: "secondary",
    },
  },
  {
    id: "system",
    label: "Hệ thống (system)",
    shortLabel: "Hệ thống",
    icon: Bell,
    color: {
      bg: "bg-slate-500/10 dark:bg-slate-500/20",
      text: "text-slate-600 dark:text-slate-400",
      border: "border-slate-500/30",
      badge: "outline",
    },
  },
];

function getCategoryConfig(type: string) {
  const found = CATEGORIES.find((c) => c.id === type);
  if (found) return found;
  return {
    id: type,
    label: type,
    shortLabel: type,
    icon: Bell,
    color: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
      badge: "outline" as const,
    },
  };
}

function formatRelativeTimeVi(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "Vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFullTimeVi(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function groupNotificationsByDate(items: Notification[]): { group: string; items: Notification[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const groups: { [key: string]: Notification[] } = {
    "Hôm nay": [],
    "Hôm qua": [],
    "Trong 7 ngày qua": [],
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
    } else if (checkDate.getTime() >= oneWeekAgo.getTime()) {
      groups["Trong 7 ngày qua"].push(item);
    } else {
      groups["Cũ hơn"].push(item);
    }
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({ group, items: list }));
}

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
    isError,
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
      // Tab check (for "read" tab since backend supports unreadOnly)
      if (tab === "read" && !item.read) return false;
      if (tab === "unread" && item.read) return false;

      // Severity check
      if (severityFilter === "attention") {
        if (item.severity !== "warning" && item.severity !== "danger") return false;
      } else if (severityFilter === "info") {
        if (item.severity === "warning" || item.severity === "danger") return false;
      }

      // Keyword search (title, body, type, eventKey)
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
  const isIndeterminate =
    selectedIds.size > 0 && !isAllSelected && allFilteredIds.some((id) => selectedIds.has(id));

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

  return (
    <div className="container max-w-5xl py-6 px-4 sm:px-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Trung tâm thông báo
                </h1>
                {totalUnreadCount > 0 && (
                  <Badge variant="danger" className="h-5 px-2 text-[11px] font-semibold tabular-nums">
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount} mới
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Theo dõi toàn diện các trao đổi Jira, luồng phát hành, sự cố và cảnh báo SLA.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>

      {/* Quick Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => {
            setTab("all");
            setSeverityFilter("all");
          }}
          className={cn(
            "p-3.5 rounded-xl border bg-card transition-all cursor-pointer flex flex-col justify-between",
            tab === "all" && severityFilter === "all"
              ? "border-primary shadow-xs ring-1 ring-primary/30"
              : "border-border hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tổng thông báo</span>
            <Bell className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {stats.total}
          </div>
        </div>

        <div
          onClick={() => {
            setTab("unread");
            setSeverityFilter("all");
          }}
          className={cn(
            "p-3.5 rounded-xl border bg-card transition-all cursor-pointer flex flex-col justify-between",
            tab === "unread"
              ? "border-primary shadow-xs ring-1 ring-primary/30"
              : "border-border hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Chưa đọc</span>
            <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
          </div>
          <div className="mt-2 text-xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
            {stats.unread}
          </div>
        </div>

        <div
          onClick={() => {
            setTab("read");
            setSeverityFilter("all");
          }}
          className={cn(
            "p-3.5 rounded-xl border bg-card transition-all cursor-pointer flex flex-col justify-between",
            tab === "read"
              ? "border-primary shadow-xs ring-1 ring-primary/30"
              : "border-border hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Đã xem</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-muted-foreground tabular-nums">
            {stats.read}
          </div>
        </div>

        <div
          onClick={() => {
            setSeverityFilter((prev) => (prev === "attention" ? "all" : "attention"));
          }}
          className={cn(
            "p-3.5 rounded-xl border bg-card transition-all cursor-pointer flex flex-col justify-between",
            severityFilter === "attention"
              ? "border-amber-500/80 shadow-xs ring-1 ring-amber-500/30"
              : "border-border hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cần chú ý</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {stats.attention}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3 bg-card p-4 rounded-xl border border-border shadow-xs">
        {/* Row 1: Search input + Status tabs + Severity selector */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo tiêu đề, nội dung, mã task..."
              className="w-full h-9 pl-9 pr-8 text-xs sm:text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded-sm"
                title="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Quick status tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all",
                tab === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tất cả ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setTab("unread")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all flex items-center gap-1.5",
                tab === "unread"
                  ? "bg-background text-teal-600 dark:text-teal-400 font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Chưa đọc
              {stats.unread > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-semibold text-white tabular-nums">
                  {stats.unread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("read")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all",
                tab === "read"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Đã đọc ({stats.read})
            </button>
          </div>
        </div>

        {/* Row 2: Category Filter Pills (Tags) */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Phân loại theo danh mục:
            </span>
            {(selectedType !== "all" || severityFilter !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Đặt lại bộ lọc
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedType === cat.id;
              const count = typeCounts[cat.id] ?? 0;
              const Icon = cat.icon;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedType(isSelected && cat.id !== "all" ? "all" : cat.id)}
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
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
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
      <div className="space-y-6">
        {isLoading ? (
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
        ) : isError ? (
          <div className="py-12 text-center rounded-xl border border-border bg-card flex flex-col items-center justify-center gap-3">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-foreground">Không thể tải danh sách thông báo</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Có lỗi xảy ra khi kết nối tới máy chủ thông báo. Vui lòng kiểm tra kết nối mạng và thử lại.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="cursor-pointer gap-1.5 text-xs mt-1"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Thử lại
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-dashed border-border bg-card/50 flex flex-col items-center justify-center gap-3">
            <div className="rounded-full bg-muted p-4 text-muted-foreground mb-1">
              <BellOff className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-foreground">
              {searchQuery
                ? "Không tìm thấy thông báo nào phù hợp"
                : tab === "unread"
                ? "Bạn đã xem hết thông báo mới!"
                : "Chưa có thông báo nào"}
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              {searchQuery ? (
                <>Không có thông báo nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;. Hãy thử tìm từ khóa khác hoặc xóa bộ lọc.</>
              ) : tab === "unread" ? (
                "Tuyệt vời! Không có hoạt động mới nào cần xử lý lúc này."
              ) : (
                "Các thông báo về bình luận Jira, chuyển trạng thái task và cảnh báo hệ thống sẽ hiển thị tại đây."
              )}
            </p>
            {(searchQuery || selectedType !== "all" || tab !== "all" || severityFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="cursor-pointer gap-1.5 text-xs mt-2"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Xóa tất cả bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedItems.map(({ group, items }) => (
              <div key={group} className="space-y-2.5">
                {/* Date group badge */}
                <div className="sticky top-14 z-10 bg-background/95 backdrop-blur-xs py-1 flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-full border border-border/50">
                    {group}
                  </span>
                  <span className="h-px flex-1 bg-border/40" />
                </div>

                {/* Notifications Cards */}
                <div className="space-y-2">
                  {items.map((n) => {
                    const isUnread = !n.read;
                    const isSelected = selectedIds.has(n.id);
                    const isExpanded = expandedBodies.has(n.id);
                    const category = getCategoryConfig(n.type);
                    const CategoryIcon = category.icon;

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleCardClick(n)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${n.title}${isUnread ? " (chưa đọc)" : ""}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCardClick(n);
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
                        <div
                          className="pt-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectOne(n.id)}
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

                              <Badge
                                variant={category.color.badge}
                                className="h-4 px-1.5 text-[10px] font-medium"
                              >
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
                                  onClick={(e) => toggleBodyExpand(e, n.id)}
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
                                onClick={(e) => handleToggleRead(e, n)}
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
                                onClick={(e) => handleDeleteSingle(e, n)}
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
        )}
      </div>

      {/* Confirmation Dialog for Deletion */}
      <Dialog
        open={confirmDeleteDialog !== null}
        onOpenChange={(open) => !open && setConfirmDeleteDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
              {confirmDeleteDialog === "allRead"
                ? "Dọn dẹp tất cả thông báo đã đọc?"
                : `Xóa ${selectedIds.size} thông báo đã chọn?`}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground pt-1">
              {confirmDeleteDialog === "allRead"
                ? "Hành động này sẽ xóa toàn bộ các thông báo đã đọc khỏi lịch sử của bạn. Bạn không thể hoàn tác thao tác này."
                : `Hành động này sẽ xóa vĩnh viễn ${selectedIds.size} thông báo đã được chọn. Bạn có chắc chắn muốn tiếp tục?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0 mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteDialog(null)}
              className="cursor-pointer text-xs"
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="cursor-pointer text-xs gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
