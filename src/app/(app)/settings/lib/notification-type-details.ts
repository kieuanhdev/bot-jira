import type { ComponentType } from "react";
import {
  ArrowRightLeft,
  Bell,
  Clock,
  Cpu,
  GitBranch,
  MessageSquare,
  RefreshCw,
  Rocket,
  ShieldAlert,
} from "lucide-react";

export type Preferences = {
  disabledTypes: string[];
  broadcastEnabled: boolean;
  broadcastRequired: boolean;
  allNotificationsRequired: boolean;
  pushEnabled: boolean;
  pushDisabledTypes: string[];
  knownTypes: string[];
  hasSubscription: boolean;
  deliveryMode?: string;
  digestHour?: number;
};

export type NotificationCategory = "tasks" | "release" | "system";

export interface TypeDetail {
  id: string;
  category: NotificationCategory;
  categoryLabel: string;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  colorClass: string;
  bgClass: string;
}

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string; desc: string }[] = [
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

export const TYPE_DETAILS: Record<string, TypeDetail> = {
  comment: {
    id: "comment",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Bình luận trên task & PR",
    desc: "Khi ai đó để lại bình luận trên task Jira bạn theo dõi hoặc trên Bitbucket Pull Request liên quan.",
    icon: MessageSquare,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10 border-blue-500/20",
  },
  issue: {
    id: "issue",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Cập nhật thông tin task theo dõi",
    desc: "Khi task thay đổi người phụ trách (assignee), mô tả, độ ưu tiên, phiên bản hoặc các trường thông tin quan trọng.",
    icon: RefreshCw,
    colorClass: "text-cyan-600 dark:text-cyan-400",
    bgClass: "bg-cyan-500/10 border-cyan-500/20",
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
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10 border-amber-500/20",
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
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
  },
  sentry: {
    id: "sentry",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Lỗi Sentry blocker nghiêm trọng",
    desc: "Khi phát hiện sự cố blocker hoặc ngoại lệ mới từ Sentry có nguy cơ ảnh hưởng trực tiếp đến đợt phát hành.",
    icon: ShieldAlert,
    colorClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10 border-rose-500/20",
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
    colorClass: "text-slate-600 dark:text-slate-400",
    bgClass: "bg-slate-500/10 border-slate-500/20",
  },
};

export const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, "0")}:00`,
}));

/** Falls back to a neutral entry for notification types the UI does not know yet. */
export function getTypeDetail(type: string): TypeDetail {
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
