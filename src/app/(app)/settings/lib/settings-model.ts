import type { Role } from "@/lib/permissions";

export type User = {
  id: string;
  email: string | null;
  displayName: string;
  jiraUsername: string | null;
  role: Role;
  createdAt: Date | string;
};

export type Health = {
  status: string;
  env: {
    jiraConfigured: boolean;
    bitbucketConfigured: boolean;
    sentryConfigured: boolean;
  };
  services: Record<string, { ok: boolean; ms: number; error?: string }>;
};

export const SERVICE_KEYS = ["db", "jira", "bitbucket", "sentry", "openai"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export function getServiceHealthBadge(ok: boolean): { variant: "success" | "danger"; label: string } {
  return {
    variant: ok ? "success" : "danger",
    label: ok ? "hoạt động" : "mất kết nối",
  };
}
