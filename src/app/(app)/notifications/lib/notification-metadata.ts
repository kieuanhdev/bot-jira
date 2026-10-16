import type { Notification } from "@/hooks/use-notifications";

export {
  type NotificationFilterCategory as NotificationCategory,
  NOTIFICATION_FILTER_CATEGORIES as NOTIFICATION_CATEGORIES,
  getCategoryConfig,
} from "@/lib/notify/notification-types";

export { formatRelativeTimeVi } from "@/lib/format/time";

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
