import type { Role } from "@prisma/client";

export const DEFAULT_BROADCAST_ROLES: Role[] = ["admin"];
export const DEFAULT_DISABLED_NOTIFICATION_TYPES = ["ai", "system"] as const;

export function isDefaultBroadcastRole(role: Role | undefined): boolean {
  return Boolean(role && DEFAULT_BROADCAST_ROLES.includes(role));
}

export function isAllNotificationsRequired(role: Role | undefined): boolean {
  return role === "admin";
}
