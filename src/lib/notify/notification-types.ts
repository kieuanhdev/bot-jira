/**
 * Canonical notification types, categories, labels, and visual presentation styles.
 * Safe for client bundles: zero Prisma, zero env, zero Node built-ins.
 */

import type { ComponentType } from "react";
import {
  Bell,
  MessageSquare,
  ArrowRightLeft,
  Clock,
  Rocket,
  ShieldAlert,
  GitBranch,
  GitPullRequest,
  Sparkles,
  RefreshCw,
  Cpu,
  type LucideIcon,
} from "lucide-react";

export type NotificationFilterBadge =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type NotificationFilterCategory = {
  id: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  color: {
    bg: string;
    text: string;
    border: string;
    badge: NotificationFilterBadge;
  };
};

export type NotificationSettingsCategory = "tasks" | "release" | "system";

export interface NotificationTypeDetail {
  id: string;
  category: NotificationSettingsCategory;
  categoryLabel: string;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  colorClass: string;
  bgClass: string;
}

export const NOTIFICATION_SETTINGS_CATEGORIES: {
  id: NotificationSettingsCategory;
  label: string;
  desc: string;
}[] = [
  {
    id: "tasks",
    label: "Công việc & Task Jira",
    desc: "Bình luận, cập nhật tiến độ, luồng xử lý và cảnh báo quá hạn SLA của task",
  },
  {
    id: "release",
    label: "Bản phát hành & CI/CD",
    desc: "Tiến trình xuất xưởng phiên bản, kết quả build CI và sự cố blocker Sentry",
  },
  {
    id: "system",
    label: "AI & Hệ thống",
    desc: "Gợi ý điểm story point từ AI, tác vụ hàng loạt và cảnh báo sức khỏe dịch vụ",
  },
];

export const TYPE_LABELS: Record<string, string> = {
  comment: "Bình luận",
  issue: "Cập nhật task",
  transition: "Chuyển trạng thái",
  stale: "SLA / Tồn đọng",
  release: "Phát hành",
  sentry: "Lỗi Sentry",
  ci: "Build / CI",
  ai: "AI gợi ý",
  system: "Hệ thống",
  pr: "Pull Request",
};

export const NOTIFICATION_FILTER_CATEGORIES: NotificationFilterCategory[] = [
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
      bg: "bg-info/10",
      text: "text-info",
      border: "border-info/30",
      badge: "info",
    },
  },
  {
    id: "issue",
    label: "Cập nhật task (issue)",
    shortLabel: "Task Jira",
    icon: RefreshCw,
    color: {
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/30",
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
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/30",
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
      bg: "bg-destructive/10",
      text: "text-destructive",
      border: "border-destructive/30",
      badge: "danger",
    },
  },
  {
    id: "ci",
    label: "Build & CI/CD (ci)",
    shortLabel: "Build & CI",
    icon: GitBranch,
    color: {
      bg: "bg-success/10",
      text: "text-success",
      border: "border-success/30",
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
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
      badge: "outline",
    },
  },
  {
    id: "pr",
    label: "Pull Request (pr)",
    shortLabel: "PR & Merge",
    icon: GitPullRequest,
    color: {
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/30",
      badge: "warning",
    },
  },
];

export function getCategoryConfig(type: string): NotificationFilterCategory {
  const found = NOTIFICATION_FILTER_CATEGORIES.find((c) => c.id === type);
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

export const TYPE_DETAILS: Record<string, NotificationTypeDetail> = {
  comment: {
    id: "comment",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Bình luận trên task & PR",
    desc: "Khi ai đó để lại bình luận trên task Jira bạn theo dõi hoặc trên Bitbucket Pull Request liên quan.",
    icon: MessageSquare,
    colorClass: "text-info",
    bgClass: "bg-info/10 border-info/20",
  },
  issue: {
    id: "issue",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Cập nhật thông tin task theo dõi",
    desc: "Khi task thay đổi người phụ trách (assignee), mô tả, độ ưu tiên, phiên bản hoặc các trường thông tin quan trọng.",
    icon: RefreshCw,
    colorClass: "text-primary",
    bgClass: "bg-primary/10 border-primary/20",
  },
  transition: {
    id: "transition",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Chuyển trạng thái workflow task",
    desc: "Khi trạng thái workflow của task được chuyển tiếp (ví dụ: To Do → In Progress → In Review → Done).",
    icon: ArrowRightLeft,
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-500/10 border-purple-500/20",
  },
  stale: {
    id: "stale",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Cảnh báo task tồn đọng / quá hạn SLA",
    desc: "Khi task bạn được gán không có cập nhật hoặc đứng yên ở một trạng thái vượt quá số ngày SLA quy định.",
    icon: Clock,
    colorClass: "text-warning",
    bgClass: "bg-warning/10 border-warning/20",
  },
  release: {
    id: "release",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Trạng thái bản phát hành (Release)",
    desc: "Khi bản phát hành Fix Version sẵn sàng đóng gói, bị chặn bởi release gate hoặc đã được xuất xưởng thành công.",
    icon: Rocket,
    colorClass: "text-teal-600 dark:text-teal-400",
    bgClass: "bg-teal-500/10 border-teal-500/20",
  },
  ci: {
    id: "ci",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Kết quả build & kiểm thử CI",
    desc: "Khi tiến trình CI hoàn tất thành công, thất bại hoặc bị hủy trên commit phát hành liên quan.",
    icon: GitBranch,
    colorClass: "text-success",
    bgClass: "bg-success/10 border-success/20",
  },
  sentry: {
    id: "sentry",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Lỗi Sentry blocker nghiêm trọng",
    desc: "Khi phát hiện sự cố blocker hoặc ngoại lệ mới từ Sentry có nguy cơ ảnh hưởng trực tiếp đến đợt phát hành.",
    icon: ShieldAlert,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/10 border-destructive/20",
  },
  ai: {
    id: "ai",
    category: "system",
    categoryLabel: "AI & Hệ thống",
    label: "Gợi ý điểm story point từ AI",
    desc: "Khi mô hình AI (OpenAI / Ollama) hoàn tất phân tích yêu cầu và đề xuất điểm ước lượng cho task mới.",
    icon: Cpu,
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgClass: "bg-indigo-500/10 border-indigo-500/20",
  },
  system: {
    id: "system",
    category: "system",
    categoryLabel: "AI & Hệ thống",
    label: "Thông báo hệ thống & tiến trình nền",
    desc: "Khi thao tác hàng loạt (bulk operations) hoàn tất hoặc cảnh báo sức khỏe của worker nền / đồng bộ Jira.",
    icon: Bell,
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted border-border",
  },
};

/** Falls back to a neutral entry for notification types the UI does not know yet. */
export function getTypeDetail(type: string): NotificationTypeDetail {
  return (
    TYPE_DETAILS[type] ?? {
      id: type,
      category: "tasks",
      categoryLabel: "Khác",
      label: type,
      desc: "",
      icon: Bell,
      colorClass: "text-muted-foreground",
      bgClass: "bg-muted/30 border-border",
    }
  );
}

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
