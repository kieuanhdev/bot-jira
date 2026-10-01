import {
  Bell,
  MessageSquare,
  ArrowRightLeft,
  Clock,
  Rocket,
  ShieldAlert,
  GitBranch,
  Sparkles,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { Notification } from "@/hooks/use-notifications";

export type NotificationCategory = {
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
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
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

export function getCategoryConfig(type: string): NotificationCategory {
  const found = NOTIFICATION_CATEGORIES.find((c) => c.id === type);
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
      badge: "outline",
    },
  };
}

export function formatRelativeTimeVi(dateStr: string): string {
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

export function formatFullTimeVi(dateStr: string): string {
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

export type NotificationDateGroup = { group: string; items: Notification[] };

export function groupNotificationsByDate(items: Notification[]): NotificationDateGroup[] {
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
