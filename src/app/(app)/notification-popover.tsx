"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  ArrowRightLeft,
  Clock,
  Rocket,
  ShieldAlert,
  GitBranch,
  Cpu,
  RefreshCw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useNotifications,
  useUnreadCount,
  useMarkNotifications,
  type Notification,
} from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/utils";

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

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const { data, isLoading, isError, refetch } = useNotifications({
    limit: 15,
    enabled: open,
  });
  const { markRead, markAllRead, isPending } = useMarkNotifications();

  const items = data?.items ?? [];
  const hasUnread = unread > 0;
  const unreadLabel = unread > 99 ? "99+" : String(unread);
  const buttonAriaLabel = hasUnread
    ? `Thông báo, ${unread} thông báo chưa đọc`
    : "Thông báo, không có thông báo chưa đọc";

  const handleItemClick = (n: Notification) => {
    if (!n.read) {
      markRead([n.id]);
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const handleMarkAll = async () => {
    await markAllRead();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative cursor-pointer transition-colors duration-150"
          aria-label={buttonAriaLabel}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {hasUnread && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground shadow-sm"
              aria-hidden="true"
            >
              {unreadLabel}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-4 sm:p-6" aria-describedby={undefined}>
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-semibold">Thông báo</DialogTitle>
            {hasUnread && (
              <Badge variant="info" className="text-xs px-1.5 py-0">
                {unreadLabel} mới
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 pr-6">
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleMarkAll}
                disabled={isPending}
                title="Đánh dấu tất cả đã đọc"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Đọc tất cả
              </Button>
            )}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center h-8 px-2 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer rounded-md"
              title="Xem tất cả thông báo"
            >
              Xem tất cả
              <ExternalLink className="h-3 w-3 ml-1" aria-hidden="true" />
            </Link>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pt-2 pr-1">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-lg border border-border p-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium">Không thể tải thông báo</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="cursor-pointer gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Thử lại
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
              <div className="rounded-full bg-muted p-3 text-muted-foreground">
                <BellOff className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium">Không có thông báo nào</p>
              <p className="text-xs text-muted-foreground">
                Bạn đã cập nhật tất cả thông tin mới nhất.
              </p>
            </div>
          ) : (
            items.map((n) => {
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
                  className={`group relative flex gap-3 rounded-lg border p-3 text-sm transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isUnread
                      ? "bg-primary/5 dark:bg-primary/10 border-primary/20 hover:bg-primary/10 dark:hover:bg-primary/15"
                      : "border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="mt-0.5 shrink-0 rounded-full bg-background border border-border p-1.5 h-7 w-7 flex items-center justify-center shadow-xs">
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`truncate font-medium leading-snug ${
                          isUnread ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {n.title}
                      </span>
                      {isUnread && (
                        <span className="shrink-0 flex h-2 w-2 rounded-full bg-primary" title="Chưa đọc" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{timeAgo(n.createdAt)}</span>
                      {n.link ? (
                        <span className="text-primary group-hover:underline inline-flex items-center gap-0.5">
                          Xem chi tiết
                          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isUnread) {
                              markRead([n.id]);
                            }
                          }}
                          className="hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          {isUnread ? "Đánh dấu đã đọc" : "Đã đọc"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
