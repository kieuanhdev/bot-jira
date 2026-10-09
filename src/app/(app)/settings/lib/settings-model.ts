import type { Role } from "@/lib/permissions";

export type User = {
  id: string;
  email: string;
  displayName: string;
  jiraUsername: string | null;
  role: Role;
  createdAt: string;
};

export type Health = {
  status: string;
  env: {
    jiraConfigured: boolean;
    bitbucketConfigured: boolean;
    sentryConfigured: boolean;
    ollamaConfigured: boolean;
  };
  services: Record<string, { ok: boolean; ms: number; error?: string }>;
};

export const SERVICE_KEYS = ["db", "jira", "bitbucket", "sentry", "openai", "ollama"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export function getServiceHealthBadge(ok: boolean): { variant: "success" | "danger"; label: string } {
  return {
    variant: ok ? "success" : "danger",
    label: ok ? "hoạt động" : "mất kết nối",
  };
}
