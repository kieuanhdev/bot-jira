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

export {
  type NotificationSettingsCategory as NotificationCategory,
  type NotificationTypeDetail as TypeDetail,
  NOTIFICATION_SETTINGS_CATEGORIES as NOTIFICATION_CATEGORIES,
  TYPE_DETAILS,
  getTypeDetail,
} from "@/lib/notify/notification-types";

export const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, "0")}:00`,
}));
