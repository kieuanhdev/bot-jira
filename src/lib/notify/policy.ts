import type { Role } from "@prisma/client";

export const DEFAULT_BROADCAST_ROLES: Role[] = ["lead", "release_manager", "admin"];
export const DEFAULT_DISABLED_NOTIFICATION_TYPES = ["ai", "system"] as const;
export const ALWAYS_NOTIFY_JIRA_USERNAMES = ["anhnk_mb"] as const;

export function isDefaultBroadcastRole(role: Role | undefined): boolean {
  return Boolean(role && DEFAULT_BROADCAST_ROLES.includes(role));
}

export function isAlwaysNotifyUser(jiraUsername: string | null | undefined): boolean {
  const normalized = jiraUsername?.trim().toLowerCase();
  return Boolean(
    normalized && ALWAYS_NOTIFY_JIRA_USERNAMES.some((username) => username === normalized)
  );
}
